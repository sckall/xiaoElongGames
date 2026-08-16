/**
 * 《鳄龙咆哮》实时 FPS 规则引擎（服务端权威）。
 *
 * 设计目标：
 * - 纯 TS 零依赖，随机数可注入，便于单测与回放；
 * - 固定步长 tick(20Hz)：移动/重力/碰撞/射击/技能/效果/重生/胜负全在服务端结算；
 * - applyInput 对每个动作做白名单 + 数值域校验，非法输入安全拒绝（不抛异常）；
 * - getSnapshot(playerId) 按玩家视角投影：隐身敌人、私有伤害事件等不下发；
 * - 内置 bot：通过 chooseAIInputs(getSnapshot(botId)) 决策，只使用玩家视角信息。
 */
import {
  GAME_ID,
  HERO_DEFS,
  HERO_IDS,
  INPUT_TYPES,
  OBSTACLES,
  SPAWN_POINTS,
  WEAPON_DEFS,
  WEAPON_IDS,
  clampNum,
  dirFromYawPitch,
  pickSpawn,
  rayAabbXZ,
  segmentBlocked,
  wrapAngle,
} from './defs';
import { BALANCE, abilityNum } from './balance';
import type {
  AABB,
  AIStyle,
  AILevel,
  EffectKind,
  EngineOptions,
  EventKind,
  GameModeKind,
  HeroId,
  PlayerConfig,
  RealtimeInputAction,
  Snapshot,
  SnapshotEffect,
  SnapshotEvent,
  SnapshotPlayer,
  TeamId,
  TrainingPattern,
  TrainingTargetConfig,
  TrainingTargetKind,
  Vec3,
  WeaponId,
} from './defs';
import { chooseAIInputs } from './ai';

const MAX_EVENTS = 500;

export interface EnginePlayerState {
  id: string;
  name: string;
  isBot: boolean;
  team: TeamId;
  hero: HeroId | null;
  targetKind: TrainingTargetKind | null;
  hitRadius: number;
  maxHp: number;
  hp: number;
  shield: number;
  shieldT: number;
  alive: boolean;
  pos: Vec3;
  yaw: number;
  pitch: number;
  velY: number;
  onGround: boolean;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  reloading: boolean;
  reloadT: number;
  fireCd: number;
  skillCd: number;
  ultCharge: number;
  ads: boolean;
  spreadBloom: number;
  shots: number;
  hits: number;
  headshots: number;
  damageDealt: number;
  stealthT: number;
  stealthStrikeUsed: boolean;
  skillAim: boolean;
  ultAim: boolean;
  fortifyT: number;
  invulnT: number;
  slowT: number;
  slowMult: number;
  respawnAt: number;
  kills: number;
  deaths: number;
  score: number;
  /** 最近一次输入（服务端内存态） */
  moveX: number;
  moveZ: number;
  fireHeld: boolean;
  jumpRequested: boolean;
  adsHeld: boolean;
}

interface EngineEffect {
  id: number;
  kind: EffectKind;
  pos: Vec3;
  radius: number;
  t: number;
  duration: number;
  ownerId: string;
  dps: number;
  heal: number;
  fuse: number;
  targetId?: string;
  damage: number;
  accumulate: number;
  /** 持续伤害/治疗的结算节拍计时（每 effectChunkMs 结算一次） */
  chunkT?: number;
  yaw?: number;
  pitch?: number;
  arc?: number;
  width?: number;
  height?: number;
  /** 抛体（粘性炸弹）速度与飞行状态 */
  vx?: number;
  vy?: number;
  vz?: number;
  flying?: boolean;
}

interface EngineEvent {
  seq: number;
  kind: EventKind;
  text: string;
  at: number;
  pos?: Vec3;
  shooterId?: string;
  targetId?: string;
  amount?: number;
  isPublic: boolean;
  privateTo: string[];
}

export interface EngineDebug {
  place(playerId: string, pos: Vec3, yaw?: number, pitch?: number): void;
  setHp(playerId: string, hp: number): void;
  setUltCharge(playerId: string, charge: number): void;
  forceSkillReady(playerId: string): void;
  players: EnginePlayerState[];
}

interface WorldRayHit {
  t: number;
  x: number;
  y: number;
  z: number;
  kind: 'wall' | 'box' | 'none';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 数值选项：非法或越界一律回退默认值（安全默认优先） */
function optNum(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return fallback;
  return v;
}

function safeName(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, 24) : '玩家';
}

function heroForPlayer(idx: number, rng: () => number): HeroId {
  return HERO_IDS[Math.floor(rng() * HERO_IDS.length) % HERO_IDS.length];
}

/** 射线 vs 世界（掩体 + 围墙，含高度）。命中 y 由障碍高度决定（墙高取 WALL_HEIGHT）。 */
function rayWorld(ox: number, oy: number, oz: number, dir: Vec3, maxT: number): WorldRayHit {
  let best: WorldRayHit = { t: maxT, x: ox, y: oy, z: oz, kind: 'none' };
  const boxes: AABB[] = [
    ...OBSTACLES.map((b) => ({ ...b })),
    { minX: BALANCE.arena.half, maxX: BALANCE.arena.half + 4, minZ: -BALANCE.arena.half - 4, maxZ: BALANCE.arena.half + 4, height: 4 },
    { minX: -BALANCE.arena.half - 4, maxX: -BALANCE.arena.half, minZ: -BALANCE.arena.half - 4, maxZ: BALANCE.arena.half + 4, height: 4 },
    { minX: -BALANCE.arena.half - 4, maxX: BALANCE.arena.half + 4, minZ: BALANCE.arena.half, maxZ: BALANCE.arena.half + 4, height: 4 },
    { minX: -BALANCE.arena.half - 4, maxX: BALANCE.arena.half + 4, minZ: -BALANCE.arena.half - 4, maxZ: -BALANCE.arena.half, height: 4 },
  ];
  for (const b of boxes) {
    const t = rayAabbXZ(ox, oz, dir.x, dir.z, b);
    if (t < 0 || t >= best.t || t >= maxT) continue;
    const y = oy + dir.y * t;
    if (y < -0.5 || y > b.height + 0.5) continue; // 枪线高度不经过该盒子
    best = { t, x: ox + dir.x * t, y, z: oz + dir.z * t, kind: 'box' };
  }
  return best;
}

/** 射线 vs 胶囊（线段 a→b + 半径 r）。返回最近命中参数 t（沿单位方向），未命中 Infinity。 */
function rayCapsule(
  ox: number,
  oy: number,
  oz: number,
  dir: Vec3,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const wx = ox - ax;
  const wy = oy - ay;
  const wz = oz - az;

  const dd = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z;
  const vv = abx * abx + aby * aby + abz * abz;
  const dv = dir.x * abx + dir.y * aby + dir.z * abz;
  const dw = dir.x * wx + dir.y * wy + dir.z * wz;
  const vw = abx * wx + aby * wy + abz * wz;

  const denom = dd * vv - dv * dv;
  let tHit = Infinity;
  if (Math.abs(denom) > 1e-9) {
    const t = (dv * vw - vv * dw) / denom;
    const s = (dd * vw - dv * dw) / denom;
    if (t >= 0 && s >= 0 && s <= 1) {
      const px = ox + dir.x * t;
      const py = oy + dir.y * t;
      const pz = oz + dir.z * t;
      const qx = ax + abx * s;
      const qy = ay + aby * s;
      const qz = az + abz * s;
      const d2 = (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
      if (d2 <= r * r) tHit = t;
    }
  }
  // 端点球（线段两端）。注意：端点球未命中返回 Infinity，
  // 不能用返回值直接覆盖 tHit——否则会把上面“柱身”命中的结果冲掉，
  // 导致向下/向上瞄准躯干时只有头部球能命中（历史 bug：身体判定看似失效）。
  const sphereHit = (cx: number, cy: number, cz: number) => {
    const mx = ox - cx;
    const my = oy - cy;
    const mz = oz - cz;
    const b = dir.x * mx + dir.y * my + dir.z * mz;
    const c = mx * mx + my * my + mz * mz - r * r;
    const disc = b * b - dd * c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / dd;
    const t2 = (-b + sq) / dd;
    return t1 >= 0 ? t1 : t2 >= 0 ? t2 : Infinity;
  };
  tHit = Math.min(tHit, sphereHit(ax, ay, az), sphereHit(bx, by, bz));
  return tHit;
}

export class CorcodragonFightEngine {
  readonly gameId = GAME_ID;
  readonly mode: GameModeKind;
  readonly scoreLimit: number;
  readonly matchTimeMs: number;
  readonly heroSelectMs: number;
  readonly respawnMs: number;
  readonly aiStyle: AIStyle;
  readonly aiLevel: AILevel;
  phase: 'heroSelect' | 'playing' | 'gameOver' = 'heroSelect';
  t = 0;
  timeLeft: number;
  heroSelectLeft: number;
  winnerId: string | null = null;
  winnerTeam: TeamId | null = null;
  teamScores: Record<TeamId, number> = { A: 0, B: 0 };
  readonly players: EnginePlayerState[] = [];

  private rng: () => number;
  private acc = 0;
  private targetMeta = new Map<string, TrainingTargetConfig>();
  private trainingRespawnMs = 1200;
  private effectSeq = 1;
  private eventSeq = 0;
  /** 全部事件环（供测试/回放检查；平台只消费 getSnapshot 的增量投影） */
  readonly events: EngineEvent[] = [];
  /** 击杀完整流水（事件环可能被裁剪，此日志不裁剪，供测试/统计） */
  readonly killLog: { at: number; shooterId: string | null; targetId: string }[] = [];
  private lastSentSeq = new Map<string, number>();
  private lastInputSeq = new Map<string, number>();
  private botNextThink = new Map<string, number>();
  private effects: EngineEffect[] = [];

  constructor(players: PlayerConfig[], options: EngineOptions = {}) {
    if (!Array.isArray(players) || players.length < 1 || players.length > 8) {
      throw new Error(`玩家数量需在 1-8 之间（实际 ${Array.isArray(players) ? players.length : '非数组'}）`);
    }
    const mode: GameModeKind =
      options.mode === 'tdm' ? 'tdm' : options.mode === 'training' ? 'training' : 'ffa';
    const scoreLimit = optNum(options.scoreLimit, 1, 200, BALANCE.combat.scoreLimitDefault);
    const matchTimeMs = optNum(options.matchTimeMs, 30_000, 3_600_000, BALANCE.combat.matchTimeMsDefault);
    const heroSelectMs = optNum(options.heroSelectMs, 5_000, 120_000, BALANCE.combat.heroSelectMsDefault);
    const aiStyle: AIStyle = options.aiStyle === 'movement' ? 'movement' : 'combat';
    const aiLevel: AILevel =
      options.aiLevel === 'easy' || options.aiLevel === 'hard' ? options.aiLevel : 'normal';
    const respawnMs = optNum(
      options.respawnMs,
      1_000,
      120_000,
      BALANCE.combat.respawnMs,
    );
    const rng = typeof options.rng === 'function' ? options.rng : Math.random;

    this.mode = mode;
    this.scoreLimit = scoreLimit;
    this.matchTimeMs = matchTimeMs;
    this.heroSelectMs = heroSelectMs;
    this.respawnMs = respawnMs;
    this.aiStyle = aiStyle;
    this.aiLevel = aiLevel;
    this.timeLeft = matchTimeMs;
    this.heroSelectLeft = heroSelectMs;
    this.rng = rng;

    const seen = new Set<string>();
    players.forEach((p, i) => {
      const id = String(p?.id ?? `p${i + 1}`);
      if (seen.has(id)) throw new Error(`玩家 id 重复：${id}`);
      seen.add(id);
      const team: TeamId = mode === 'tdm' ? (i % 2 === 0 ? 'A' : 'B') : 'A';
      const hero =
        mode === 'training' && !p?.isBot ? 'yanren' : p?.isBot ? heroForPlayer(i, rng) : null;
      const def = hero ? HERO_DEFS[hero] : null;
      this.players.push({
        id,
        name: safeName(p?.name) || `玩家${i + 1}`,
        isBot: !!p?.isBot,
        team,
        hero,
        targetKind: null,
        hitRadius: BALANCE.arena.playerRadius,
        maxHp: def?.hp ?? 100,
        hp: def?.hp ?? 100,
        shield: 0,
        shieldT: 0,
        alive: true,
        pos: { ...SPAWN_POINTS[i % SPAWN_POINTS.length] },
        yaw: i % 2 === 0 ? 0 : Math.PI,
        pitch: 0,
        velY: 0,
        onGround: true,
        weapon: 'rifle',
        ammo: WEAPON_DEFS.rifle.magSize,
        reserve: WEAPON_DEFS.rifle.reserve,
        reloading: false,
        reloadT: 0,
        fireCd: 0,
        skillCd: 0,
        ultCharge: 0,
        ads: false,
        spreadBloom: 0,
        shots: 0,
        hits: 0,
        headshots: 0,
        damageDealt: 0,
        stealthT: 0,
        stealthStrikeUsed: false,
        skillAim: false,
        ultAim: false,
        fortifyT: 0,
        invulnT: 0,
        slowT: 0,
        slowMult: 0.5,
        respawnAt: 0,
        kills: 0,
        deaths: 0,
        score: 0,
        moveX: 0,
        moveZ: 0,
        fireHeld: false,
        jumpRequested: false,
        adsHeld: false,
      });
      if (p?.isBot) this.botNextThink.set(id, 300 + i * 180);
    });

    if (mode === 'training') {
      const targets = Array.isArray(options.trainingTargets) ? options.trainingTargets : [];
      this.trainingRespawnMs =
        typeof options.trainingTargetRespawnMs === 'number' &&
        Number.isFinite(options.trainingTargetRespawnMs)
          ? Math.max(100, Math.min(30_000, options.trainingTargetRespawnMs))
          : 1200;
      for (const t of targets) {
        if (!t || typeof t.id !== 'string' || seen.has(t.id)) continue;
        seen.add(t.id);
        const kind: TrainingTargetKind = t.kind === 'human' ? 'human' : 'round';
        const hp = optNum(t.hp, 1, 10_000, kind === 'round' ? 1 : 100);
        const radius =
          t.kind === 'round'
            ? optNum(t.radius, 0.2, 3, 0.8) ?? 0.8
            : BALANCE.arena.playerRadius;
        const pos = {
          x: optNum(t.pos?.x, -BALANCE.arena.half + 2, BALANCE.arena.half - 2, 0) ?? 0,
          y: 0,
          z: optNum(t.pos?.z, -BALANCE.arena.half + 2, BALANCE.arena.half - 2, 0) ?? 0,
        };
        this.targetMeta.set(t.id, {
          id: t.id,
          kind,
          pattern: t.pattern === 'patrol' ? 'patrol' : t.pattern === 'osc' ? 'osc' : 'fixed',
          pos: { ...pos },
          hp,
          radius,
          range: optNum(t.range, 0.5, 20, 8) ?? 8,
          speed: optNum(t.speed, 0.1, 5, kind === 'round' ? 1.2 : 0.7) ?? 0.7,
        });
        this.players.push({
          id: t.id,
          name: kind === 'round' ? `圆靶 ${t.id}` : `人靶 ${t.id}`,
          isBot: false,
          team: 'A',
          hero: null,
          targetKind: kind,
          hitRadius: radius,
          maxHp: hp,
          hp,
          shield: 0,
          shieldT: 0,
          alive: true,
          pos: { ...pos },
          yaw: Math.PI,
          pitch: 0,
          velY: 0,
          onGround: true,
          weapon: 'dagger',
          ammo: Infinity,
          reserve: Infinity,
          reloading: false,
          reloadT: 0,
          fireCd: 0,
          skillCd: 0,
          ultCharge: 0,
          ads: false,
          spreadBloom: 0,
          shots: 0,
          hits: 0,
          headshots: 0,
          damageDealt: 0,
          stealthT: 0,
          stealthStrikeUsed: false,
          skillAim: false,
          ultAim: false,
          fortifyT: 0,
          invulnT: 0,
          slowT: 0,
          slowMult: 0.5,
          respawnAt: 0,
          kills: 0,
          deaths: 0,
          score: 0,
          moveX: 0,
          moveZ: 0,
          fireHeld: false,
          jumpRequested: false,
          adsHeld: false,
        });
      }
      this.pushEvent('info', '🎯 训练场：命中圆靶/人靶，HUD 实时统计命中率', undefined, true, []);
      this.beginMatch();
      return;
    }

    this.pushEvent('info', '🐊 《鳄龙咆哮》对局创建：选择你的英雄，准备开战！', undefined, true, []);
    if (this.players.every((p) => p.hero)) this.beginMatch();
  }

  // ---------------- 查询 ----------------

  player(id: string): EnginePlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }

  isEnemy(a: EnginePlayerState, b: EnginePlayerState): boolean {
    if (this.mode === 'training') {
      return !!a.targetKind !== !!b.targetKind; // 真人 vs 靶子
    }
    return this.mode === 'ffa' ? a.id !== b.id : a.team !== b.team;
  }

  isAlly(a: EnginePlayerState, b: EnginePlayerState): boolean {
    return this.mode === 'tdm' && a.id !== b.id && a.team === b.team;
  }

  private hasLOS(a: Vec3, b: Vec3, targetY = BALANCE.arena.chestY): boolean {
    if (segmentBlocked(a.x, a.z, b.x, b.z)) return false;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / dist, y: (targetY - BALANCE.arena.eyeY) / dist, z: dz / dist };
    const hit = rayWorld(a.x, BALANCE.arena.eyeY, a.z, dir, dist);
    return hit.kind === 'none' || hit.t >= dist - 0.05;
  }

  /** 平台日志（加入/离开/断线等），进入公开事件流 */
  log(text: string): void {
    this.pushEvent('info', text, undefined, true, []);
  }

  /**
   * 记录该玩家最新输入序号（平台在 applyInput 前调用）。
   * 快照会把最后确认序号回带，客户端据此丢弃已确认的待回滚输入。
   */
  recordInputSeq(playerId: string, seq: unknown): void {
    if (typeof seq !== 'number' || !Number.isFinite(seq) || seq < 0) return;
    const prev = this.lastInputSeq.get(playerId) ?? -1;
    if (seq > prev) this.lastInputSeq.set(playerId, Math.floor(seq));
  }

  /**
   * 平台断线托管开关：真人断线 → 引擎按 bot 接管（AI 只用该座位视角）；
   * 真人重连 → 关闭托管并清空其输入。站桩/移除语义可在此扩展。
   */
  setAutopilot(playerId: string, on: boolean): { ok: boolean; error?: string } {
    const p = this.player(playerId);
    if (!p) return { ok: false, error: `未知玩家 ${playerId}` };
    if (p.isBot === on) return { ok: true };
    p.isBot = on;
    if (on) {
      p.moveX = 0;
      p.moveZ = 0;
      p.fireHeld = false;
      p.adsHeld = false;
      p.ads = false;
      p.skillAim = false;
      p.ultAim = false;
      this.botNextThink.set(p.id, this.t + 200);
      this.log(`${p.name} 断线，由 AI 接管 🤖`);
    } else {
      this.botNextThink.delete(p.id);
      p.moveX = 0;
      p.moveZ = 0;
      p.fireHeld = false;
      p.skillAim = false;
      p.ultAim = false;
      this.log(`${p.name} 重新上线，恢复操作 ✅`);
    }
    return { ok: true };
  }

  // ---------------- 输入校验 ----------------

  applyInput(playerId: string, raw: unknown): { ok: boolean; error?: string } {
    const p = this.player(playerId);
    if (!p) return { ok: false, error: `未知玩家 ${playerId}` };
    if (!isRecord(raw) || typeof raw.type !== 'string' || !INPUT_TYPES.has(raw.type)) {
      return { ok: false, error: '非法动作：type 不在白名单内' };
    }
    const type = raw.type as RealtimeInputAction['type'];

    switch (type) {
      case 'selectHero': {
        const canPickWhileDead =
          this.phase === 'playing' && !p.alive && this.t < p.respawnAt;
        if (this.phase !== 'heroSelect' && !canPickWhileDead) {
          return { ok: false, error: '当前阶段不能选择英雄' };
        }
        if (typeof raw.hero !== 'string' || !(HERO_IDS as readonly string[]).includes(raw.hero)) {
          return { ok: false, error: '非法英雄 id' };
        }
        const prev = p.hero;
        p.hero = raw.hero as HeroId;
        const def = HERO_DEFS[p.hero];
        p.maxHp = def.hp;
        if (canPickWhileDead) {
          // 死亡换英雄：复活时按新英雄满血重生，当前仍保持阵亡状态
          this.pushEvent(
            'info',
            `${p.name} 阵亡期间换为 ${def.emoji} ${def.name}（复活后生效）`,
            undefined,
            true,
            [],
          );
        } else {
          p.hp = def.hp;
          this.pushEvent('info', `${p.name} 选择了 ${def.emoji} ${def.name}`, undefined, true, []);
        }
        void prev;
        if (this.phase === 'heroSelect' && this.players.every((x) => x.hero)) this.beginMatch();
        return { ok: true };
      }
      case 'move': {
        if (this.phase !== 'playing' || !p.alive) return { ok: false, error: '当前状态不能移动' };
        const x = clampNum(raw.x, -1, 1);
        const z = clampNum(raw.z, -1, 1);
        if (x == null || z == null) return { ok: false, error: 'move.x/z 必须为有限数值' };
        p.moveX = x;
        p.moveZ = z;
        return { ok: true };
      }
      case 'look': {
        if (typeof raw.yaw !== 'number' || !Number.isFinite(raw.yaw)) {
          return { ok: false, error: 'look.yaw 必须为有限数值' };
        }
        if (typeof raw.pitch !== 'number' || !Number.isFinite(raw.pitch)) {
          return { ok: false, error: 'look.pitch 必须为有限数值' };
        }
        if (Math.abs(raw.pitch) > Math.PI / 2) {
          return { ok: false, error: 'look.pitch 超出允许范围' };
        }
        p.yaw = wrapAngle(raw.yaw);
        p.pitch = Math.max(-BALANCE.arena.pitchClamp, Math.min(BALANCE.arena.pitchClamp, raw.pitch));
        return { ok: true };
      }
      case 'jump': {
        if (typeof raw.pressed !== 'boolean') return { ok: false, error: 'jump.pressed 必须为布尔值' };
        if (this.phase === 'playing' && p.alive) p.jumpRequested = raw.pressed;
        return { ok: true };
      }
      case 'fire': {
        if (typeof raw.pressed !== 'boolean') return { ok: false, error: 'fire.pressed 必须为布尔值' };
        if (raw.pressed && (this.phase !== 'playing' || !p.alive)) {
          return { ok: false, error: '当前状态不能开火' };
        }
        p.fireHeld = raw.pressed;
        return { ok: true };
      }
      case 'ads': {
        if (typeof raw.pressed !== 'boolean') return { ok: false, error: 'ads.pressed 必须为布尔值' };
        if (p.skillAim || p.ultAim) return { ok: false, error: '瞄准状态不能开镜' };
        if (this.phase === 'playing' && p.alive && !WEAPON_DEFS[p.weapon].melee) {
          p.adsHeld = raw.pressed;
          p.ads = raw.pressed;
        }
        return { ok: true };
      }
      case 'reload': {
        if (this.phase !== 'playing' || !p.alive) return { ok: false, error: '当前状态不能换弹' };
        return this.startReload(p);
      }
      case 'switchWeapon': {
        if (this.phase !== 'playing' || !p.alive) return { ok: false, error: '当前状态不能切换武器' };
        if (typeof raw.weapon !== 'string' || !(WEAPON_IDS as readonly string[]).includes(raw.weapon)) {
          return { ok: false, error: '非法武器 id' };
        }
        const w = raw.weapon as WeaponId;
        if (p.weapon !== w) {
          p.weapon = w;
          p.reloading = false;
          p.reloadT = 0;
          p.ads = false;
          p.skillAim = false;
          p.ultAim = false;
          p.spreadBloom = 0;
          p.fireCd = Math.max(p.fireCd, 0.25);
          const def = WEAPON_DEFS[w];
          p.ammo = def.magSize;
          p.reserve = def.reserve;
          this.pushEvent('info', `${p.name} 切换到 ${def.emoji}${def.name}`, undefined, true, []);
        }
        return { ok: true };
      }
      case 'skill': {
        if (this.phase !== 'playing' || !p.alive) return { ok: false, error: '当前状态不能释放技能' };
        return this.useSkill(p);
      }
      case 'skillFire': {
        if (this.phase !== 'playing' || !p.alive) return { ok: false, error: '当前状态不能确认技能' };
        return this.confirmSkill(p);
      }
      case 'skillCancel': {
        return this.cancelSkill(p);
      }
      case 'ult': {
        if (this.phase !== 'playing' || !p.alive) return { ok: false, error: '当前状态不能释放终极技能' };
        return this.useUlt(p);
      }
      case 'ultFire': {
        if (this.phase !== 'playing' || !p.alive) return { ok: false, error: '当前状态不能确认终极技能' };
        return this.confirmUlt(p);
      }
      case 'ultCancel': {
        return this.cancelUlt(p);
      }
      case 'spawn': {
        if (this.phase !== 'playing') return { ok: false, error: '当前阶段不能重生' };
        if (p.alive) return { ok: false, error: '玩家仍存活' };
        if (this.t < p.respawnAt) return { ok: false, error: '重生倒计时未结束' };
        this.respawn(p);
        return { ok: true };
      }
      default:
        return { ok: false, error: `未知动作 ${type}` };
    }
  }

  // ---------------- 主循环 ----------------

  tick(dtMs: number): void {
    if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs < 0) return;
    this.acc += Math.min(dtMs, 250);
    while (this.acc >= BALANCE.tick.stepMs) {
      this.acc -= BALANCE.tick.stepMs;
      this.step();
    }
  }

  private step(): void {
    this.t += BALANCE.tick.stepMs;
    const dt = BALANCE.tick.stepMs / 1000;

    if (this.phase === 'heroSelect') {
      this.heroSelectLeft = Math.max(0, this.heroSelectLeft - BALANCE.tick.stepMs);
      for (const p of this.players) {
        if (!p.hero) {
          if (p.isBot) {
            p.hero = heroForPlayer(this.players.indexOf(p), this.rng);
            const def = HERO_DEFS[p.hero];
            p.maxHp = def.hp;
            p.hp = def.hp;
          }
        }
      }
      if (this.players.every((x) => x.hero)) {
        this.beginMatch();
        return;
      }
      if (this.heroSelectLeft <= 0) {
        for (const p of this.players) {
          if (!p.hero) {
            p.hero = heroForPlayer(this.players.indexOf(p), this.rng);
            const def = HERO_DEFS[p.hero];
            p.maxHp = def.hp;
            p.hp = def.hp;
            this.pushEvent('info', `${p.name} 未选择英雄，自动分配 ${def.name}`, undefined, true, []);
          }
        }
        this.beginMatch();
      }
      return;
    }

    if (this.phase === 'gameOver') return;

    if (this.mode !== 'training') {
      this.timeLeft = Math.max(0, this.timeLeft - BALANCE.tick.stepMs);
    }

    // 1. 冷却与状态推进
    for (const p of this.players) {
      if (!p.alive) {
        if (this.t >= p.respawnAt) this.respawn(p);
        continue;
      }
      p.fireCd = Math.max(0, p.fireCd - dt);
      p.skillCd = Math.max(0, p.skillCd - dt);
      p.spreadBloom = Math.max(
        0,
        p.spreadBloom - WEAPON_DEFS[p.weapon].bloomRecoveryPerSec * dt,
      );
      p.shieldT = Math.max(0, p.shieldT - dt);
      if (p.shieldT <= 0) p.shield = 0;
      p.stealthT = Math.max(0, p.stealthT - dt);
      p.fortifyT = Math.max(0, p.fortifyT - dt);
      p.invulnT = Math.max(0, p.invulnT - dt);
      p.slowT = Math.max(0, p.slowT - dt);
      p.ultCharge = Math.min(
        BALANCE.combat.ultChargeMax,
        p.ultCharge + BALANCE.combat.ultPerSecond * dt,
      );
      if (p.reloading) {
        p.reloadT = Math.max(0, p.reloadT - BALANCE.tick.stepMs);
        if (p.reloadT <= 0) {
          p.reloading = false;
          const def = WEAPON_DEFS[p.weapon];
          const need = def.magSize - p.ammo;
          if (def.reserve === Infinity) {
            p.ammo = def.magSize;
          } else {
            const take = Math.min(need, p.reserve);
            p.ammo += take;
            p.reserve -= take;
          }
        }
      }
    }

    // 2. 移动物理
    for (const p of this.players) {
      if (!p.alive) continue;
      this.movePlayer(p, dt);
    }

    // 2.5 训练场靶子移动
    if (this.mode === 'training') this.stepTrainingTargets();

    // 3. 射击（长按 + 近战）；二段瞄准中不射普通子弹（左键用于确认技能）
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.fireHeld && p.fireCd <= 0 && !p.reloading && !p.skillAim && !p.ultAim) {
        this.fire(p);
      }
    }

    // 4. 效果结算
    this.stepEffects();

    // 5. bot 决策
    for (const p of this.players) {
      if (!p.isBot) continue;
      const next = this.botNextThink.get(p.id) ?? 0;
      if (this.t >= next) {
        const level = BALANCE.ai.levels[this.aiLevel] ?? BALANCE.ai.levels.normal;
        this.botNextThink.set(
          p.id,
          this.t + level.thinkMs + Math.floor(this.rng() * 120),
        );
        const view = this.getSnapshot(p.id);
        const actions = chooseAIInputs(view, {
          rng: this.rng,
          style: this.aiStyle,
          level: this.aiLevel,
        });
        for (const a of actions) this.applyInput(p.id, a);
      }
    }

    // 6. 胜负判定（训练场无胜负）
    if (this.mode !== 'training' && this.timeLeft <= 0) {
      this.endGame();
    }
  }

  private movePlayer(p: EnginePlayerState, dt: number): void {
    const def = p.hero ? HERO_DEFS[p.hero] : HERO_DEFS.yanren;
    let speed = def.speed;
    if (p.stealthT > 0) {
      speed *= p.hero ? abilityNum(p.hero, 'stealthSpeedMult', 1.25) : 1.25;
    }
    if (p.ads) speed *= BALANCE.movement.adsSpeedMult;
    if (p.slowT > 0) speed *= p.slowMult;
    // 契约：applyInput 的 move.x/z 是【世界系】方向向量。
    // 视角相对换算在客户端唯一出口 viewRelativeMove() 完成（AI 同样发世界系），
    // 服务端不重复乘 yaw，避免“按键方向随视角二次旋转”的绝对方向 bug。
    let mx = p.moveX;
    let mz = p.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    p.pos.x += mx * speed * dt;
    p.pos.z += mz * speed * dt;

    // 重力与跳跃
    p.velY -= BALANCE.movement.gravity * dt;
    p.pos.y += p.velY * dt;
    if (p.pos.y <= 0) {
      p.pos.y = 0;
      p.velY = 0;
      p.onGround = true;
    } else {
      p.onGround = false;
    }
    if (p.jumpRequested && p.onGround) {
      p.velY = BALANCE.movement.jumpVelocity;
      p.pos.y += p.velY * dt;
      p.onGround = false;
      p.jumpRequested = false;
    } else if (p.jumpRequested && !p.onGround) {
      p.jumpRequested = false;
    }

    this.resolveCollision(p);
  }

  /** 圆形（玩家 XZ 截面）对 AABB 掩体/围墙的碰撞解算 */
  private resolveCollision(p: EnginePlayerState): void {
    const r = BALANCE.arena.playerRadius;
    for (const b of OBSTACLES) {
      const nx = Math.max(b.minX, Math.min(p.pos.x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(p.pos.z, b.maxZ));
      let dx = p.pos.x - nx;
      let dz = p.pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          p.pos.x = nx + dx * r;
          p.pos.z = nz + dz * r;
        } else {
          // 圆心在盒内：沿最小穿透轴推出
          const left = p.pos.x - b.minX;
          const right = b.maxX - p.pos.x;
          const back = p.pos.z - b.minZ;
          const front = b.maxZ - p.pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) p.pos.x = b.minX - r;
          else if (m === right) p.pos.x = b.maxX + r;
          else if (m === back) p.pos.z = b.minZ - r;
          else p.pos.z = b.maxZ + r;
        }
      }
    }
    p.pos.x = Math.max(-BALANCE.arena.half + r, Math.min(BALANCE.arena.half - r, p.pos.x));
    p.pos.z = Math.max(-BALANCE.arena.half + r, Math.min(BALANCE.arena.half - r, p.pos.z));
  }

  private fire(p: EnginePlayerState): void {
    const def = WEAPON_DEFS[p.weapon];
    const eye: Vec3 = { x: p.pos.x, y: p.pos.y + BALANCE.arena.eyeY, z: p.pos.z };
    // 散布 = 基础散布 + 连续射击膨胀（开镜时膨胀衰减到 30%）
    const spread =
      (p.ads ? def.adsSpread : def.spread) + p.spreadBloom * (p.ads ? 0.3 : 1);
    const yaw = p.yaw + (this.rng() * 2 - 1) * spread;
    const pitch = Math.max(
      -BALANCE.arena.pitchClamp,
      Math.min(BALANCE.arena.pitchClamp, p.pitch + (this.rng() * 2 - 1) * spread),
    );
    const dir = dirFromYawPitch(yaw, pitch);
    const fortifyMul =
      p.fortifyT > 0
        ? p.hero
          ? abilityNum(p.hero, 'fortifyFireRateMult', 0.6)
          : 0.6
        : 1;
    p.fireCd = (def.interval * fortifyMul) / 1000;
    if (def.melee) {
      this.meleeStrike(p, eye, dir);
      return;
    }
    if (p.ammo <= 0) {
      this.startReload(p);
      return;
    }
    p.ammo -= 1;
    p.shots += 1;
    p.spreadBloom = Math.min(def.bloomMax, p.spreadBloom + def.bloomPerShot);

    const worldHit = rayWorld(eye.x, eye.y, eye.z, dir, def.range);
    let bestT = worldHit.t;

    // 铁壁方向护盾：与当前视角实时同步的能量墙，吸收敌方子弹；
    // 站在墙后的队友同样被保护（按几何拦截，不区分目标）。
    const shieldHit = this.rayShields(p, eye, dir, bestT);
    if (shieldHit && shieldHit.t < bestT) {
      bestT = shieldHit.t;
    }

    let bestTarget: EnginePlayerState | null = null;
    for (const q of this.players) {
      if (!q.alive || !this.isEnemy(p, q)) continue;
      const capBottom =
        q.targetKind === 'round' ? 0.2 : BALANCE.arena.capsuleBottomY;
      const capTop =
        q.targetKind === 'round'
          ? capBottom + q.hitRadius * 2
          : BALANCE.arena.capsuleTopY;
      const t = rayCapsule(
        eye.x,
        eye.y,
        eye.z,
        dir,
        q.pos.x,
        q.pos.y + capBottom,
        q.pos.z,
        q.pos.x,
        q.pos.y + capTop,
        q.pos.z,
        q.hitRadius,
      );
      if (t < bestT) {
        bestT = t;
        bestTarget = q;
      }
    }

    // 子弹先撞上敌方护盾：能量墙吸收这一发，不继续穿透
    if (shieldHit && shieldHit.t <= bestT && shieldHit.t < worldHit.t) {
      const hitPoint = {
        x: eye.x + dir.x * shieldHit.t,
        y: eye.y + dir.y * shieldHit.t,
        z: eye.z + dir.z * shieldHit.t,
      };
      const falloff =
        shieldHit.t <= def.falloffStart
          ? 1
          : shieldHit.t >= def.falloffEnd
            ? def.minDmgMult
            : 1 -
              ((shieldHit.t - def.falloffStart) /
                Math.max(1e-6, def.falloffEnd - def.falloffStart)) *
                (1 - def.minDmgMult);
      const dmg = Math.max(1, Math.round(def.damage * falloff));
      this.pushEvent('shot', '', { ...hitPoint }, true, [], p.id);
      this.pushEvent('blocked', '🛡️ 护盾拦截', { ...hitPoint }, true, [], p.id, shieldHit.owner.id, dmg);
      this.absorbShieldHit(shieldHit.owner, dmg);
      return;
    }

    if (bestTarget) {
      const hitY = eye.y + dir.y * bestT;
      const dist = bestT;
      const falloff =
        dist <= def.falloffStart
          ? 1
          : dist >= def.falloffEnd
            ? def.minDmgMult
            : 1 -
              ((dist - def.falloffStart) / Math.max(1e-6, def.falloffEnd - def.falloffStart)) *
                (1 - def.minDmgMult);
      const headshot = hitY >= BALANCE.arena.headshotMinY && !def.melee;
      let dmg = def.damage * falloff * (headshot ? def.headshot : 1);
      // 影枭重做：隐身中的首次命中直接把目标生命压到 1（不再只是翻倍）
      const firstStealthStrike = p.stealthT > 0 && !p.stealthStrikeUsed;
      if (firstStealthStrike) {
        p.stealthStrikeUsed = true;
      }
      const hitPoint = { x: eye.x + dir.x * bestT, y: hitY, z: eye.z + dir.z * bestT };
      this.pushEvent(
        'shot',
        '',
        { ...hitPoint },
        true,
        [],
        p.id,
        bestTarget.id,
      );
      this.damagePlayer(bestTarget, dmg, p, hitPoint, headshot, firstStealthStrike);
      // 影枭：任何武器命中都会退出隐身；若仍在隐身（首击）则立即充满终极技
      if (p.stealthT > 0) {
        p.stealthT = 0;
        p.ultCharge = BALANCE.combat.ultChargeMax;
        this.pushEvent('info', `${p.name} 破隐命中：终极技已充能完毕！`, { ...hitPoint }, true, []);
      }
    } else {
      const end = { x: eye.x + dir.x * bestT, y: eye.y + dir.y * bestT, z: eye.z + dir.z * bestT };
      this.pushEvent('shot', '', end, true, [], p.id);
    }
  }

  /**
   * 射线 vs 所有“敌方铁壁能量墙”。返回最近命中；只拦截从墙正面飞来的子弹
   * （墙是视角正前方的竖直矩形，随 owner 的 yaw 实时旋转）。
   */
  private rayShields(
    shooter: EnginePlayerState,
    eye: Vec3,
    dir: Vec3,
    maxT: number,
  ): { t: number; owner: EnginePlayerState } | null {
    let best: { t: number; owner: EnginePlayerState } | null = null;
    for (const q of this.players) {
      if (!q.alive || q.shield <= 0 || q.shieldT <= 0) continue;
      if (!this.isEnemy(shooter, q)) continue;
      const fw = { x: Math.sin(q.yaw), z: Math.cos(q.yaw) };
      const denom = dir.x * fw.x + dir.z * fw.z;
      if (denom >= -1e-6) continue; // 只拦正面入射（子弹朝墙飞来）
      const distance = q.hero ? abilityNum(q.hero, 'shieldDistance', 1.8) : 1.8;
      const width = q.hero ? abilityNum(q.hero, 'shieldWidth', 4.8) : 4.8;
      const height = q.hero ? abilityNum(q.hero, 'shieldHeight', 3) : 3;
      const centerY = q.pos.y + (q.hero ? abilityNum(q.hero, 'shieldCenterY', 1.2) : 1.2);
      const cx = q.pos.x + fw.x * distance;
      const cz = q.pos.z + fw.z * distance;
      const num = (cx - eye.x) * fw.x + (cz - eye.z) * fw.z;
      const t = num / denom; // denom < 0：正面入射；t>0 表示射线确实会到达墙面
      if (t <= 0 || t >= maxT) continue;
      const px = eye.x + dir.x * t;
      const py = eye.y + dir.y * t;
      const pz = eye.z + dir.z * t;
      const right = { x: -fw.z, z: fw.x };
      const off = (px - cx) * right.x + (pz - cz) * right.z;
      if (Math.abs(off) > width / 2) continue;
      if (py < centerY - height / 2 || py > centerY + height / 2) continue;
      if (!best || t < best.t) best = { t, owner: q };
    }
    return best;
  }

  /** 子弹被铁壁护盾吸收：扣护盾生命，打空则提前破碎 */
  private absorbShieldHit(owner: EnginePlayerState, amount: number): void {
    if (owner.shield <= 0) return;
    owner.shield = Math.max(0, owner.shield - amount);
    if (owner.shield <= 0) {
      owner.shieldT = 0;
      this.pushEvent('skill', `🛡️ ${owner.name} 的能量护盾破碎！`, { ...owner.pos }, true, [], owner.id);
    }
  }

  private meleeStrike(p: EnginePlayerState, eye: Vec3, dir: Vec3): void {
    p.shots += 1;
    let best: EnginePlayerState | null = null;
    let bestScore = Infinity;
    for (const q of this.players) {
      if (!q.alive || !this.isEnemy(p, q)) continue;
      const dx = q.pos.x - eye.x;
      const dz = q.pos.z - eye.z;
      const dist = Math.hypot(dx, dz);
      const dy = Math.abs(q.pos.y - p.pos.y);
      if (dist > WEAPON_DEFS.dagger.range || dy > 1.6) continue;
      const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle > 0.55) continue;
      if (segmentBlocked(p.pos.x, p.pos.z, q.pos.x, q.pos.z)) continue;
      if (dist < bestScore) {
        bestScore = dist;
        best = q;
      }
    }
    if (best) {
      const hitPoint = { x: best.pos.x, y: best.pos.y + BALANCE.arena.chestY, z: best.pos.z };
      let dmg = WEAPON_DEFS.dagger.damage;
      const firstStealthStrike = p.stealthT > 0 && !p.stealthStrikeUsed;
      if (firstStealthStrike) p.stealthStrikeUsed = true;
      this.pushEvent('shot', '', hitPoint, true, [], p.id, best.id);
      this.damagePlayer(best, dmg, p, hitPoint, false, firstStealthStrike);
      if (p.stealthT > 0) {
        p.stealthT = 0;
        p.ultCharge = BALANCE.combat.ultChargeMax;
        this.pushEvent('info', `${p.name} 破隐命中：终极技已充能完毕！`, { ...hitPoint }, true, []);
      }
    } else {
      const end = { x: eye.x + dir.x * 2, y: eye.y + dir.y * 2, z: eye.z + dir.z * 2 };
      this.pushEvent('shot', '', end, true, [], p.id);
    }
  }

  private damagePlayer(
    target: EnginePlayerState,
    rawAmount: number,
    attacker: EnginePlayerState | null,
    hitPoint?: Vec3,
    headshot = false,
    firstStealthStrike = false,
  ): void {
    if (!target.alive || this.phase !== 'playing') return;
    // 重生无敌：任何伤害来源（子弹/技能/爆炸）都不生效
    if (target.invulnT > 0) return;
    let amount = rawAmount;
    if (target.fortifyT > 0) {
      amount *= target.hero ? abilityNum(target.hero, 'fortifyDamageMult', 0.5) : 0.5;
    }
    amount = Math.max(1, Math.round(amount));
    const hpBefore = target.hp;
    // 影枭重做：隐身中的首次命中把目标生命直接压到 1（不再只翻倍）。
    // 目标只有 1 血时不会被这次命中击杀（“降至 1”语义）。
    if (firstStealthStrike) {
      target.hp = hpBefore > 1 ? 1 : hpBefore;
      amount = Math.max(0, hpBefore - target.hp);
    } else {
      target.hp -= amount;
    }
    // 影枭被命中立即退出隐身（敌人恢复可见）
    if (target.stealthT > 0) {
      target.stealthT = 0;
      this.pushEvent('info', `${target.name} 受击显形！`, { ...target.pos }, true, []);
    }
    if (attacker) {
      attacker.hits += 1;
      attacker.damageDealt += amount;
      if (headshot) attacker.headshots += 1;
      attacker.ultCharge = Math.min(
        BALANCE.combat.ultChargeMax,
        attacker.ultCharge + amount * BALANCE.combat.ultPerDamage,
      );
    }
    this.pushEvent(
      'hit',
      headshot ? '爆头！' : firstStealthStrike ? '破隐一击：生命降至 1' : '',
      hitPoint,
      false,
      attacker ? [attacker.id, target.id] : [target.id],
      attacker?.id,
      target.id,
      amount,
    );
    if (target.hp <= 0) {
      this.killPlayer(target, attacker);
    }
  }

  private killPlayer(victim: EnginePlayerState, killer: EnginePlayerState | null): void {
    victim.alive = false;
    victim.deaths += 1;
    victim.hp = 0;
    victim.shield = 0;
    victim.shieldT = 0;
    victim.stealthT = 0;
    victim.stealthStrikeUsed = false;
    victim.skillAim = false;
    victim.ultAim = false;
    victim.invulnT = 0;
    victim.ads = false;
    victim.fireHeld = false;
    victim.moveX = 0;
    victim.moveZ = 0;
    victim.respawnAt =
      this.t + (this.mode === 'training' ? this.trainingRespawnMs : this.respawnMs);
    this.killLog.push({ at: this.t, shooterId: killer?.id ?? null, targetId: victim.id });
    if (killer) {
      killer.kills += 1;
      if (this.mode !== 'training') killer.score += 1;
      killer.ultCharge = Math.min(
        BALANCE.combat.ultChargeMax,
        killer.ultCharge + BALANCE.combat.ultPerKill,
      );
      if (this.mode === 'tdm') this.teamScores[killer.team] += 1;
      this.pushEvent(
        'kill',
        `${killer.name} 击碎了 ${victim.name}`,
        { ...victim.pos },
        true,
        [],
        killer.id,
        victim.id,
      );
    } else {
      this.pushEvent('kill', `${victim.name} 阵亡`, { ...victim.pos }, true, [], undefined, victim.id);
    }
    if (this.mode === 'ffa' && killer && killer.score >= this.scoreLimit) {
      this.endGame(killer.id);
    } else if (this.mode === 'tdm' && killer && this.teamScores[killer.team] >= this.scoreLimit) {
      this.endGame(undefined, killer.team);
    }
  }

  private healPlayer(target: EnginePlayerState, amount: number, healer: EnginePlayerState | null): void {
    if (!target.alive || this.phase !== 'playing') return;
    const real = Math.min(target.maxHp - target.hp, Math.round(amount));
    if (real <= 0) return;
    target.hp += real;
    this.pushEvent('heal', '', { ...target.pos }, false, [target.id], healer?.id, target.id, real);
  }

  private respawn(p: EnginePlayerState): void {
    if (p.alive) return;
    const def = p.hero ? HERO_DEFS[p.hero] : null;
    p.alive = true;
    p.hp = def?.hp ?? 100;
    p.maxHp = def?.hp ?? 100;
    p.shield = 0;
    p.shieldT = 0;
    p.stealthT = 0;
    p.stealthStrikeUsed = false;
    p.skillAim = false;
    p.ultAim = false;
    p.fortifyT = 0;
    // 训练场靶子不享受重生无敌（避免影响连续打靶统计）
    p.invulnT = p.targetKind ? 0 : BALANCE.combat.respawnInvulnMs / 1000;
    p.slowT = 0;
    p.slowMult = 0.5;
    p.velY = 0;
    p.pos = pickSpawn(
      this.rng,
      this.players.filter((q) => q.alive && this.isEnemy(p, q)).map((q) => q.pos),
      this.players.filter((q) => q.id !== p.id && q.alive).map((q) => q.pos),
    );
    p.yaw = this.rng() * Math.PI * 2 - Math.PI;
    p.pitch = 0;
    const wd = WEAPON_DEFS[p.weapon];
    p.ammo = wd.magSize;
    p.reserve = wd.reserve;
    p.reloading = false;
    p.reloadT = 0;
    p.fireCd = 0;
    p.skillCd = 0;
    p.spreadBloom = 0;
    this.pushEvent('respawn', `${p.name} 重返战场`, { ...p.pos }, true, [], p.id);
  }

  private startReload(p: EnginePlayerState): { ok: boolean; error?: string } {
    const def = WEAPON_DEFS[p.weapon];
    if (def.melee) return { ok: false, error: '近战武器无需换弹' };
    if (p.reloading) return { ok: false, error: '正在换弹' };
    if (p.ammo >= def.magSize) return { ok: false, error: '弹匣已满' };
    if (p.reserve !== Infinity && p.reserve <= 0) return { ok: false, error: '备弹不足' };
    p.reloading = true;
    p.reloadT = def.reloadMs;
    p.ads = false;
    p.skillAim = false;
    p.ultAim = false;
    return { ok: true };
  }

  // ---------------- 技能 ----------------

  private useSkill(p: EnginePlayerState): { ok: boolean; error?: string } {
    if (!p.hero) return { ok: false, error: '尚未选择英雄' };
    const def = HERO_DEFS[p.hero];
    if (p.skillCd > 0) return { ok: false, error: `${def.skillName} 冷却中` };
    switch (p.hero) {
      case 'yanren': {
        const dir = dirFromYawPitch(p.yaw, 0);
        const start = { ...p.pos };
        const dashDistance = abilityNum(p.hero, 'dashDistance', 10);
        const trailRadius = abilityNum(p.hero, 'trailRadius', 1.1);
        const trailDuration = abilityNum(p.hero, 'trailDuration', 2.5);
        const trailDps = abilityNum(p.hero, 'trailDps', 14);
        for (let d = 0.5; d <= dashDistance; d += 0.5) {
          const x = start.x + dir.x * d;
          const z = start.z + dir.z * d;
          const clamped = { x, y: 0, z };
          const probe: EnginePlayerState = { ...p, pos: clamped };
          this.resolveCollision(probe);
          p.pos.x = probe.pos.x;
          p.pos.z = probe.pos.z;
          if (Math.floor(d * 2) % 2 === 0) {
            this.addEffect(
              'fireTrail',
              { x: p.pos.x, y: 0, z: p.pos.z },
              trailRadius,
              trailDuration,
              p.id,
              trailDps,
              0,
              0,
              0,
            );
          }
        }
        p.skillCd = def.skillCd;
        this.pushEvent('skill', `${p.name} 释放 ${def.skillName} 🔥`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      case 'yingxiao': {
        p.stealthT = abilityNum(p.hero, 'stealthDuration', 4);
        p.stealthStrikeUsed = false;
        p.skillCd = def.skillCd;
        this.pushEvent('skill', `${p.name} 进入暗影潜行 🦉`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      case 'tiebi': {
        // 重做：在视角正前方展开一面随视角实时旋转的能量墙（几何拦截子弹）
        p.shield = abilityNum(p.hero, 'shieldValue', 300);
        p.shieldT = abilityNum(p.hero, 'shieldDuration', 6);
        p.skillCd = def.skillCd;
        this.pushEvent('skill', `${p.name} 展开能量护盾 🛡️`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      case 'lingyin': {
        // 重做：向视角方向发射扇形治愈波（自己 + 扇形内队友）
        this.healPlayer(p, abilityNum(p.hero, 'selfHeal', 45), p);
        const waveRange = abilityNum(p.hero, 'waveRange', 14);
        const waveHalfAngle = (abilityNum(p.hero, 'waveAngleDeg', 60) * Math.PI) / 360;
        const allyHeal = abilityNum(p.hero, 'allyHeal', 30);
        const fw = dirFromYawPitch(p.yaw, 0);
        for (const q of this.players) {
          if (!this.isAlly(p, q)) continue;
          const dx = q.pos.x - p.pos.x;
          const dz = q.pos.z - p.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > waveRange) continue;
          const dot = (dx * fw.x + dz * fw.z) / (dist || 1);
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          if (angle > waveHalfAngle) continue;
          this.healPlayer(q, allyHeal, p);
        }
        this.addEffect(
          'healWave',
          { ...p.pos },
          waveRange,
          0.6,
          p.id,
          0,
          0,
          0,
          0,
          undefined,
          { yaw: p.yaw, arc: waveHalfAngle },
        );
        p.skillCd = def.skillCd;
        this.pushEvent('skill', `${p.name} 释放治愈波 💚`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      case 'guilei': {
        // 二段瞄准：第一次按 Q 进入准备状态，左键（skillFire）向当前视角投掷；
        // 再次按 Q 或 skillCancel 取消，冷却在真正投掷时才结算。
        if (p.skillAim) {
          p.skillAim = false;
          this.pushEvent('info', `${p.name} 取消了炸弹投掷`, { ...p.pos }, true, []);
          return { ok: true };
        }
        p.skillAim = true;
        p.ads = false;
        p.fireHeld = false;
        this.pushEvent('info', `${p.name} 准备投掷粘性炸弹 💣（点击左键投掷 / 右键取消）`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知英雄' };
    }
  }

  /** 二段技能确认（当前仅诡雷炸弹使用） */
  private confirmSkill(p: EnginePlayerState): { ok: boolean; error?: string } {
    if (!p.hero) return { ok: false, error: '尚未选择英雄' };
    if (!p.skillAim) return { ok: false, error: '尚未进入技能瞄准状态' };
    const def = HERO_DEFS[p.hero];
    if (p.skillCd > 0) return { ok: false, error: `${def.skillName} 冷却中` };
    switch (p.hero) {
      case 'guilei': {
        const dir = dirFromYawPitch(p.yaw, p.pitch);
        const eye = { x: p.pos.x, y: p.pos.y + BALANCE.arena.eyeY, z: p.pos.z };
        const speed = abilityNum(p.hero, 'bombSpeed', 16);
        const bombDamage = abilityNum(p.hero, 'bombDamage', 35);
        // 服务端权威抛体：初速度沿视角方向，tick 内受 bombGravity 下落，
        // 落地/撞掩体后粘住并开始 1.2s 引信（客户端据此渲染可见抛物线）
        this.addEffect(
          'bomb',
          { ...eye },
          0.5,
          10,
          p.id,
          0,
          0,
          0,
          bombDamage,
          undefined,
          { vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, flying: true },
        );
        p.skillAim = false;
        p.skillCd = def.skillCd;
        this.pushEvent('skill', `${p.name} 抛出粘性炸弹 💣`, { ...eye }, true, [], p.id);
        return { ok: true };
      }
      default:
        return { ok: false, error: '该英雄技能无需确认' };
    }
  }

  private cancelSkill(p: EnginePlayerState): { ok: boolean; error?: string } {
    if (!p.skillAim) return { ok: false, error: '当前没有待确认的技能' };
    p.skillAim = false;
    p.ads = false;
    this.pushEvent('info', `${p.name} 取消了技能瞄准`, { ...p.pos }, true, [], p.id);
    return { ok: true };
  }

  private useUlt(p: EnginePlayerState): { ok: boolean; error?: string } {
    if (!p.hero) return { ok: false, error: '尚未选择英雄' };
    if (p.ultCharge < BALANCE.combat.ultChargeMax) return { ok: false, error: '终极技能未充能完毕' };
    const def = HERO_DEFS[p.hero];
    switch (p.hero) {
      case 'yanren': {
        const radius = abilityNum(p.hero, 'ultRadius', 12);
        const damage = abilityNum(p.hero, 'ultDamage', 80);
        this.explodeAt({ ...p.pos }, radius, damage, p);
        p.ultCharge = 0;
        // 清晰范围提示：地面火环 + 爆炸火球
        this.addEffect('ultRing', { ...p.pos }, radius, 0.9, p.id, 0, 0, 0, 0);
        this.addEffect('explosion', { ...p.pos }, radius, 0.5, p.id, 0, 0, 0, damage);
        this.pushEvent('ult', `${p.name} 释放 ${def.ultName} 💥`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      case 'yingxiao': {
        const markRange = abilityNum(p.hero, 'markRange', 20);
        const markDelay = abilityNum(p.hero, 'markDelay', 2.5);
        let target: EnginePlayerState | null = null;
        let bestHp = Infinity;
        let bestDist = Infinity;
        for (const q of this.players) {
          if (!q.alive || !this.isEnemy(p, q)) continue;
          const dist = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
          if (dist > markRange) continue;
          if (!this.hasLOS(p.pos, q.pos)) continue;
          // 标记视野范围内“血量最低”的敌人；同血量时取最近
          if (q.hp < bestHp || (q.hp === bestHp && dist < bestDist)) {
            bestHp = q.hp;
            bestDist = dist;
            target = q;
          }
        }
        if (!target) return { ok: false, error: '没有可见的标记目标' };
        this.addEffect('explosion', { ...target.pos }, 0.6, markDelay, p.id, 0, 0, markDelay, 0, target.id);
        p.ultCharge = 0;
        this.pushEvent('ult', `${p.name} 标记了 ${target.name} ☠️`, { ...target.pos }, true, [], p.id, target.id);
        return { ok: true };
      }
      case 'tiebi': {
        p.fortifyT = abilityNum(p.hero, 'fortifyDuration', 6);
        p.ultCharge = 0;
        this.pushEvent('ult', `${p.name} 进入堡垒模式 🏰`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      case 'lingyin': {
        this.addEffect(
          'healZone',
          { ...p.pos },
          abilityNum(p.hero, 'zoneRadius', 7),
          abilityNum(p.hero, 'zoneDuration', 5),
          p.id,
          0,
          abilityNum(p.hero, 'zoneHealPerSec', 25),
          0,
          0,
        );
        p.ultCharge = 0;
        this.pushEvent('ult', `${p.name} 展开音障领域 🎵`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      case 'guilei': {
        // v0.2 调整：不再二段投掷，改为以自身为中心的圆形雷暴（控制为主、低伤害）
        const stormRadius = abilityNum(p.hero, 'stormRadius', 7);
        const stormDuration = abilityNum(p.hero, 'stormDuration', 4);
        const stormDps = abilityNum(p.hero, 'stormDps', 8);
        this.addEffect('stormZone', { ...p.pos }, stormRadius, stormDuration, p.id, stormDps, 0, 0, 0);
        p.ultCharge = 0;
        this.pushEvent('ult', `${p.name} 以自身为中心召唤雷暴云 ⛈️`, { ...p.pos }, true, [], p.id);
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知英雄' };
    }
  }

  /** 二段终极技确认（当前仅雷暴云使用） */
  private confirmUlt(p: EnginePlayerState): { ok: boolean; error?: string } {
    if (!p.hero) return { ok: false, error: '尚未选择英雄' };
    if (!p.ultAim) return { ok: false, error: '尚未进入终极技引导状态' };
    if (p.ultCharge < BALANCE.combat.ultChargeMax) {
      return { ok: false, error: '终极技能未充能完毕' };
    }
    switch (p.hero) {
      case 'guilei': {
        const dir = dirFromYawPitch(p.yaw, p.pitch);
        const eye = { x: p.pos.x, y: p.pos.y + BALANCE.arena.eyeY, z: p.pos.z };
        const stormRange = abilityNum(p.hero, 'stormRange', 25);
        const stormRadius = abilityNum(p.hero, 'stormRadius', 7);
        const stormDuration = abilityNum(p.hero, 'stormDuration', 4);
        const stormDps = abilityNum(p.hero, 'stormDps', 25);
        const hit = rayWorld(eye.x, eye.y, eye.z, dir, stormRange);
        const at =
          hit.kind !== 'none'
            ? { x: hit.x, y: 0, z: hit.z }
            : { x: eye.x + dir.x * stormRange, y: 0, z: eye.z + dir.z * stormRange };
        this.addEffect('stormZone', at, stormRadius, stormDuration, p.id, stormDps, 0, 0, 0);
        p.ultAim = false;
        p.ultCharge = 0;
        this.pushEvent('ult', `${p.name} 召唤雷暴云 ⛈️`, at, true, [], p.id);
        return { ok: true };
      }
      default:
        return { ok: false, error: '该英雄终极技无需确认' };
    }
  }

  private cancelUlt(p: EnginePlayerState): { ok: boolean; error?: string } {
    if (!p.ultAim) return { ok: false, error: '当前没有待确认的终极技' };
    p.ultAim = false;
    p.ads = false;
    this.pushEvent('info', `${p.name} 取消了终极技引导`, { ...p.pos }, true, [], p.id);
    return { ok: true };
  }

  private explodeAt(center: Vec3, radius: number, damage: number, owner: EnginePlayerState): void {
    for (const q of this.players) {
      if (!q.alive || !this.isEnemy(owner, q)) continue;
      const dist = Math.hypot(q.pos.x - center.x, q.pos.z - center.z);
      if (dist <= radius) {
        const falloff = 1 - (dist / radius) * BALANCE.combat.explosionFalloff;
        this.damagePlayer(q, damage * falloff, owner, { ...q.pos });
      }
    }
  }

  private addEffect(
    kind: EffectKind,
    pos: Vec3,
    radius: number,
    duration: number,
    ownerId: string,
    dps: number,
    heal: number,
    fuse: number,
    damage: number,
    targetId?: string,
    shape?: {
      yaw?: number;
      pitch?: number;
      arc?: number;
      width?: number;
      height?: number;
      vx?: number;
      vy?: number;
      vz?: number;
      flying?: boolean;
    },
  ): void {
    this.effects.push({
      id: this.effectSeq++,
      kind,
      pos: { ...pos },
      radius,
      t: duration,
      duration,
      ownerId,
      dps,
      heal,
      fuse,
      targetId,
      damage,
      accumulate: 0,
      ...(shape ?? {}),
    });
  }

  /** 训练场靶子运动：fixed 静止；osc 正弦往复；patrol 慢速巡逻 */
  private stepTrainingTargets(): void {
    for (const meta of this.targetMeta.values()) {
      const p = this.player(meta.id);
      if (!p || !p.alive) continue;
      if (meta.pattern === 'fixed') {
        p.moveX = 0;
        p.moveZ = 0;
        continue;
      }
      const t = this.t / 1000;
      const speed = meta.speed ?? 0.7;
      const range = meta.range ?? 8;
      const phase = t * (meta.pattern === 'patrol' ? speed * 0.5 : speed);
      p.pos.x = meta.pos.x;
      p.pos.z = meta.pos.z + Math.sin(phase) * range;
      this.resolveCollision(p);
      p.moveX = 0;
      p.moveZ = 0;
    }
  }

  private stepEffects(): void {
    const dt = BALANCE.tick.stepMs / 1000;
    const chunkSec = BALANCE.tick.effectChunkMs / 1000;
    const keep: EngineEffect[] = [];
    for (const e of this.effects) {
      e.t = Math.max(0, e.t - dt);
      const owner = this.player(e.ownerId);

      // 粘性炸弹抛体飞行：服务端权威物理，客户端据此渲染可见抛物线
      if (e.kind === 'bomb' && e.flying) {
        const g = owner && owner.hero ? abilityNum(owner.hero, 'bombGravity', 12) : 12;
        e.pos.x += (e.vx ?? 0) * dt;
        e.pos.y += (e.vy ?? 0) * dt;
        e.pos.z += (e.vz ?? 0) * dt;
        e.vy = (e.vy ?? 0) - g * dt;
        let landed = e.pos.y <= 0.05 && (e.vy ?? 0) <= 0;
        // 飞出竞技场围墙：粘在外墙
        const clamp = BALANCE.arena.half - 0.15;
        if (Math.abs(e.pos.x) >= clamp || Math.abs(e.pos.z) >= clamp) {
          e.pos.x = Math.max(-clamp, Math.min(clamp, e.pos.x));
          e.pos.z = Math.max(-clamp, Math.min(clamp, e.pos.z));
          landed = true;
        }
        // 落进掩体 AABB：粘在箱顶（从上方越过则继续飞行）
        if (!landed) {
          for (const b of OBSTACLES) {
            const insideX = e.pos.x >= b.minX && e.pos.x <= b.maxX;
            const insideZ = e.pos.z >= b.minZ && e.pos.z <= b.maxZ;
            if (insideX && insideZ && e.pos.y <= b.height + 0.05) {
              e.pos.y = b.height + 0.05;
              landed = true;
              break;
            }
          }
        }
        if (landed) {
          e.flying = false;
          e.vx = 0;
          e.vy = 0;
          e.vz = 0;
          e.pos.y = Math.max(0.05, e.pos.y);
          e.fuse = owner && owner.hero ? abilityNum(owner.hero, 'bombFuse', 1.2) : 1.2;
        }
      }
      if (!(e.kind === 'bomb' && e.flying)) {
        e.fuse = Math.max(0, e.fuse - dt);
      }

      if (e.kind === 'bomb' && !e.flying && e.fuse <= 0) {
        const bombRadius =
          owner && owner.hero ? abilityNum(owner.hero, 'bombRadius', 5) : 5;
        if (owner) this.explodeAt(e.pos, bombRadius, e.damage, owner);
        this.effects.push({
          id: this.effectSeq++,
          kind: 'explosion',
          pos: { ...e.pos },
          radius: bombRadius,
          t: 0.5,
          duration: 0.5,
          ownerId: e.ownerId,
          dps: 0,
          heal: 0,
          fuse: 0,
          damage: 0,
          accumulate: 0,
        });
        this.pushEvent('skill', '💣 炸弹引爆！', { ...e.pos }, true, []);
        continue;
      }
      if (e.kind === 'explosion' && e.targetId) {
        const target = this.player(e.targetId);
        if (e.fuse <= 0 && target) {
          if (target.alive && owner && owner.hero) {
            this.damagePlayer(
              target,
              abilityNum(owner.hero, 'markDamage', 90),
              owner,
              { ...target.pos },
            );
            // 影枭大招新增：死亡标记击杀立即刷新主动技能 CD
            if (!target.alive && owner.hero === 'yingxiao') {
              owner.skillCd = 0;
              this.pushEvent('ult', `☠️ ${owner.name} 的死亡标记完成击杀，暗影潜行已刷新！`, { ...target.pos }, true, []);
            }
          }
          e.t = 0.4;
          e.targetId = undefined;
          this.pushEvent('ult', `☠️ 死亡标记引爆：${target.name}`, { ...target.pos }, true, []);
        }
      }
      if (e.t <= 0) continue;

      if (e.kind === 'fireTrail' || e.kind === 'stormZone') {
        e.chunkT = Math.max(0, (e.chunkT ?? 0) - dt);
        e.accumulate += e.dps * dt;
        if (e.chunkT <= 0) {
          for (const q of this.players) {
            if (!q.alive || (owner && !this.isEnemy(owner, q))) continue;
            const d = Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z);
            if (d > e.radius) continue;
            if (e.kind === 'stormZone' && owner?.hero) {
              q.slowT = abilityNum(owner.hero, 'slowDuration', 0.4);
              q.slowMult = abilityNum(owner.hero, 'slowMult', 0.5);
            }
            if (owner) this.damagePlayer(q, e.dps * chunkSec, owner, { ...q.pos });
          }
          e.chunkT = chunkSec;
          e.accumulate = 0;
        }
      }
      if (e.kind === 'healZone') {
        e.accumulate += e.heal * dt;
        for (const q of this.players) {
          if (!q.alive) continue;
          const same = owner && (q.id === owner.id || this.isAlly(owner, q));
          if (!same) continue;
          const d = Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z);
          if (d > e.radius) continue;
          if (e.accumulate >= chunkSec && owner) {
            this.healPlayer(q, e.heal * chunkSec, owner);
          }
        }
      }
      if (e.accumulate >= chunkSec) e.accumulate = 0;
      keep.push(e);
    }
    this.effects = keep;
  }

  // ---------------- 阶段切换与胜负 ----------------

  private beginMatch(): void {
    this.phase = 'playing';
    this.pushEvent('info', '⚔️ 战斗开始！WASD 移动，鼠标瞄准射击，1-4 切枪，Q 技能，E 终极技。', undefined, true, []);
    for (const p of this.players) {
      p.moveX = 0;
      p.moveZ = 0;
    }
  }

  private endGame(winnerId?: string, winnerTeam?: TeamId): void {
    if (this.phase === 'gameOver') return;
    this.phase = 'gameOver';
    if (winnerId) {
      this.winnerId = winnerId;
      const w = this.player(winnerId);
      this.pushEvent('gameOver', `🏆 ${w?.name ?? '玩家'} 率先达到 ${this.scoreLimit} 杀，获得胜利！`, undefined, true, []);
    } else if (winnerTeam) {
      this.winnerTeam = winnerTeam;
      this.pushEvent('gameOver', `🏆 ${winnerTeam === 'A' ? '鳄龙' : '炎龙'}队率先达到 ${this.scoreLimit} 杀，获得胜利！`, undefined, true, []);
    } else {
      // 时间到：FFA 看个人击杀；TDM 看队伍击杀
      if (this.mode === 'tdm') {
        this.winnerTeam = this.teamScores.A >= this.teamScores.B ? 'A' : 'B';
        this.pushEvent('gameOver', `⏱️ 时间到！${this.winnerTeam === 'A' ? '鳄龙' : '炎龙'}队获胜（${this.teamScores.A}:${this.teamScores.B}）`, undefined, true, []);
      } else {
        let best: EnginePlayerState | null = null;
        for (const p of this.players) {
          if (!best || p.kills > best.kills || (p.kills === best.kills && p.deaths < best.deaths)) best = p;
        }
        if (best) {
          this.winnerId = best.id;
          this.pushEvent('gameOver', `⏱️ 时间到！${best.name} 以 ${best.kills} 杀获胜`, undefined, true, []);
        }
      }
    }
  }

  // ---------------- 事件 ----------------

  private pushEvent(
    kind: EventKind,
    text: string,
    pos: Vec3 | undefined,
    isPublic: boolean,
    privateTo: string[],
    shooterId?: string,
    targetId?: string,
    amount?: number,
  ): void {
    this.events.push({
      seq: this.eventSeq++,
      kind,
      text,
      at: this.t,
      pos: pos ? { ...pos } : undefined,
      shooterId,
      targetId,
      amount,
      isPublic,
      privateTo,
    });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  /** 某玩家对 viewer 是否可见（隐身投影：敌人视角不可见） */
  private visibleTo(p: EnginePlayerState, viewer: EnginePlayerState): boolean {
    if (p.id === viewer.id) return true;
    if (p.stealthT > 0 && this.isEnemy(p, viewer)) return false;
    return true;
  }

  // ---------------- 快照投影 ----------------

  getSnapshot(playerId: string): Snapshot {
    const you = this.player(playerId);
    if (!you) throw new Error(`未知玩家 ${playerId}`);
    const lastSeq = this.lastSentSeq.get(playerId) ?? -1;
    const fresh: EngineEvent[] = [];
    for (const e of this.events) {
      if (e.seq <= lastSeq) continue;
      const involved = e.shooterId === playerId || e.targetId === playerId;
      const target = e.targetId ? this.player(e.targetId) : undefined;
      const shooter = e.shooterId ? this.player(e.shooterId) : undefined;
      const hiddenTarget = target && !this.visibleTo(target, you);
      const hiddenShooter = shooter && !this.visibleTo(shooter, you);
      if (e.isPublic) {
        // 公开事件若涉及隐身者，且 viewer 不涉及 → 隐藏，避免通过击杀信息暴露位置
        if ((hiddenTarget || hiddenShooter) && !involved) continue;
        fresh.push(e);
      } else if (e.privateTo.includes(playerId) || involved) {
        fresh.push(e);
      }
    }
    const newLast = fresh.length ? fresh[fresh.length - 1].seq : lastSeq;
    this.lastSentSeq.set(playerId, newLast);

    const players: SnapshotPlayer[] = this.players.map((p) => {
      const visible = this.visibleTo(p, you);
      const def = p.hero ? HERO_DEFS[p.hero] : null;
      const wd = WEAPON_DEFS[p.weapon];
      const base: SnapshotPlayer = {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        team: p.team,
        hero: p.hero,
        maxHp: def?.hp ?? 100,
        hp: visible ? p.hp : 0,
        shield: visible ? p.shield : 0,
        alive: p.alive,
        pos: visible ? { ...p.pos } : { x: 0, y: -100, z: 0 },
        yaw: visible ? p.yaw : 0,
        pitch: visible ? p.pitch : 0,
        weapon: p.weapon,
        ammo: visible ? p.ammo : 0,
        reserve: visible ? p.reserve : 0,
        reloading: visible && p.reloading,
        reloadT: visible ? p.reloadT : 0,
        fireCd: visible ? p.fireCd : 0,
        skillCd: visible ? p.skillCd : 0,
        ultCharge: visible ? p.ultCharge : 0,
        ads: visible && p.ads,
        stealthT: p.id === you.id ? p.stealthT : visible ? 0 : 0,
        stealthStrikeReady: p.id === you.id ? p.stealthT > 0 && !p.stealthStrikeUsed : false,
        skillAim: visible ? p.skillAim : false,
        ultAim: visible ? p.ultAim : false,
        fortifyT: visible ? p.fortifyT : 0,
        invulnT: visible ? p.invulnT : 0,
        onGround: visible && p.onGround,
        respawnIn: visible && !p.alive ? Math.max(0, p.respawnAt - this.t) / 1000 : 0,
        kills: visible ? p.kills : 0,
        deaths: visible ? p.deaths : 0,
        score: visible ? p.score : 0,
        shots: p.id === you.id ? p.shots : 0,
        hits: p.id === you.id ? p.hits : 0,
        headshots: p.id === you.id ? p.headshots : 0,
        damageDealt: p.id === you.id ? p.damageDealt : 0,
        spreadBloom: p.id === you.id ? p.spreadBloom : 0,
        targetKind: p.targetKind,
        hitRadius: p.hitRadius,
        visible,
        lastInputSeq: p.id === you.id ? (this.lastInputSeq.get(p.id) ?? -1) : -1,
      };
      void wd;
      return base;
    });

    const events: SnapshotEvent[] = fresh.map((e) => ({
      seq: e.seq,
      kind: e.kind,
      text: e.text,
      at: e.at,
      pos: e.pos ? { ...e.pos } : undefined,
      shooterId: e.shooterId,
      targetId: e.targetId,
      amount: e.amount,
    }));

    return {
      seq: Math.round(this.t / BALANCE.tick.stepMs),
      t: this.t,
      phase: this.phase,
      youId: playerId,
      mode: this.mode,
      scoreLimit: this.scoreLimit,
      timeLeft: this.timeLeft,
      heroSelectLeft: this.heroSelectLeft,
      players,
      effects: this.effects.map((e) => ({
        id: e.id,
        kind: e.kind,
        pos: { ...e.pos },
        radius: e.radius,
        t: e.t,
        duration: e.duration,
        ownerId: e.ownerId,
        ...(e.yaw !== undefined ? { yaw: e.yaw } : {}),
        ...(e.pitch !== undefined ? { pitch: e.pitch } : {}),
        ...(e.arc !== undefined ? { arc: e.arc } : {}),
        ...(e.width !== undefined ? { width: e.width } : {}),
        ...(e.height !== undefined ? { height: e.height } : {}),
      })),
      events,
      winnerId: this.winnerId,
      winnerTeam: this.winnerTeam,
      teamScores: { ...this.teamScores },
      arena: { half: BALANCE.arena.half, obstacles: OBSTACLES.map((b) => ({ ...b })) },
    };
  }

  /** 仅测试/调试用：直接摆放玩家（不是输入动作，不可经网络暴露） */
  debug: EngineDebug = {
    place: (playerId, pos, yaw = 0, pitch = 0) => {
      const p = this.player(playerId);
      if (!p) return;
      p.pos = { x: pos.x, y: pos.y, z: pos.z };
      p.yaw = yaw;
      p.pitch = pitch;
    },
    setHp: (playerId, hp) => {
      const p = this.player(playerId);
      if (!p) return;
      p.hp = Math.max(0, hp);
      if (p.hero) p.maxHp = Math.max(p.maxHp, p.hp);
    },
    setUltCharge: (playerId, charge) => {
      const p = this.player(playerId);
      if (!p) return;
      p.ultCharge = Math.max(0, Math.min(BALANCE.combat.ultChargeMax, charge));
    },
    forceSkillReady: (playerId) => {
      const p = this.player(playerId);
      if (!p) return;
      p.skillCd = 0;
    },
    players: this.players,
  };
}

export type RealtimeSnapshot = Snapshot;

export function createEngine(
  players: PlayerConfig[],
  options?: unknown,
  rng?: () => number,
): CorcodragonFightEngine {
  const opts: EngineOptions = isRecord(options)
    ? {
        mode:
          options.mode === 'tdm'
            ? 'tdm'
            : options.mode === 'ffa'
              ? 'ffa'
              : options.mode === 'training'
                ? 'training'
                : undefined,
        scoreLimit: typeof options.scoreLimit === 'number' ? options.scoreLimit : undefined,
        matchTimeMs: typeof options.matchTimeMs === 'number' ? options.matchTimeMs : undefined,
        heroSelectMs: typeof options.heroSelectMs === 'number' ? options.heroSelectMs : undefined,
        respawnMs: typeof options.respawnMs === 'number' ? options.respawnMs : undefined,
        aiStyle: options.aiStyle === 'movement' ? 'movement' : options.aiStyle === 'combat' ? 'combat' : undefined,
        aiLevel:
          options.aiLevel === 'easy' || options.aiLevel === 'normal' || options.aiLevel === 'hard'
            ? options.aiLevel
            : undefined,
      }
    : {};
  return new CorcodragonFightEngine(players, { ...opts, rng });
}
