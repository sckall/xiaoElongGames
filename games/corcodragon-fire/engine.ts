/**
 * 《鳄龙咆哮》规则引擎（回合制英雄战术射击）
 *
 * 设计定位：在不改动平台层（大厅/房间/连接）的前提下，把「英雄射击」做成
 * 服务端权威、事件驱动的回合制战术版：2-7 名玩家在 9x9 竞技场中，
 * 选英雄、走位、切换武器、射击、释放主动/终极技能，先到目标击杀数者获胜。
 *
 * 引擎满足 GameEngine 契约：getView(playerId) 投影 + apply(playerId, action) 校验。
 */

// ---------------- 基础类型与常量 ----------------

export const GAME_ID = 'corcodragon-fire';

export const HERO_IDS = ['yanren', 'yingxiao', 'tiebi', 'lingyin', 'guilei'] as const;
export type HeroId = (typeof HERO_IDS)[number];

export const WEAPON_IDS = ['rifle', 'sniper', 'pistol', 'dagger'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export interface Vec {
  x: number;
  y: number;
}

export interface HeroDef {
  key: HeroId;
  name: string;
  emoji: string;
  role: string;
  hp: number;
  moveRange: number;
  skillName: string;
  skillDesc: string;
  skillCooldown: number;
  ultName: string;
  ultDesc: string;
}

export interface WeaponDef {
  key: WeaponId;
  name: string;
  emoji: string;
  damage: number;
  range: number;
  magSize: number;
  reserve: number;
  crit: number;
  desc: string;
}

export const ARENA_SIZE = 9;

/** 固定掩体（不可通行、阻挡视线）。坐标从 0 到 ARENA_SIZE-1 */
export const OBSTACLES: Vec[] = [
  { x: 2, y: 2 },
  { x: 2, y: 6 },
  { x: 4, y: 4 },
  { x: 6, y: 2 },
  { x: 6, y: 6 },
];

export const DEFAULT_SCORE_LIMIT = 5;
export const DEFAULT_MAX_TURNS = 200;

export const HERO_DEFS: Record<HeroId, HeroDef> = {
  yanren: {
    key: 'yanren',
    name: '炎刃',
    emoji: '🔥',
    role: '突击',
    hp: 150,
    moveRange: 3,
    skillName: '烈焰冲刺',
    skillDesc: '沿直线突进最多 4 格，落地后灼烧周围 1 格内敌人 20 伤害',
    skillCooldown: 3,
    ultName: '焚天烈焰',
    ultDesc: '以自身为中心 2 格环形爆炸，造成 60 伤害',
  },
  yingxiao: {
    key: 'yingxiao',
    name: '影枭',
    emoji: '🦉',
    role: '刺客',
    hp: 125,
    moveRange: 3,
    skillName: '暗影潜行',
    skillDesc: '隐身 2 回合并提升 1 点移动力；隐身时射击暴击并打破隐身',
    skillCooldown: 4,
    ultName: '死亡标记',
    ultDesc: '标记 6 格内一名敌人，3 回合后造成 80 伤害并暴露位置',
  },
  tiebi: {
    key: 'tiebi',
    name: '铁壁',
    emoji: '🛡️',
    role: '坦克',
    hp: 250,
    moveRange: 2,
    skillName: '能量护盾',
    skillDesc: '生成 80 点护盾，持续 2 回合',
    skillCooldown: 4,
    ultName: '堡垒模式',
    ultDesc: '架设 3 回合：受到的伤害降低 30%，远程武器射程 +2',
  },
  lingyin: {
    key: 'lingyin',
    name: '灵音',
    emoji: '🎵',
    role: '支援',
    hp: 175,
    moveRange: 3,
    skillName: '治愈波',
    skillDesc: '为自己恢复 30 生命；团队模式下还为 3 格内队友恢复 30',
    skillCooldown: 3,
    ultName: '音障领域',
    ultDesc: '在 4 格内目标格创造领域（半径 2，2 回合）：己方回合开始时 +20 生命、+1 移动力',
  },
  guilei: {
    key: 'guilei',
    name: '诡雷',
    emoji: '💣',
    role: '控场',
    hp: 150,
    moveRange: 3,
    skillName: '粘性炸弹',
    skillDesc: '向 6 格内投掷炸弹（可粘敌人/地面），2 回合后爆炸，对 1 格内敌人造成 35 伤害',
    skillCooldown: 3,
    ultName: '雷暴云',
    ultDesc: '在 6 格内目标格召唤雷暴（半径 2，3 回合）：敌人回合开始时受 20 伤害并减速',
  },
};

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  rifle: {
    key: 'rifle',
    name: '步枪',
    emoji: '🔫',
    damage: 20,
    range: 7,
    magSize: 30,
    reserve: 90,
    crit: 0.1,
    desc: '均衡的自动步枪',
  },
  sniper: {
    key: 'sniper',
    name: '狙击枪',
    emoji: '🎯',
    damage: 100,
    range: 10,
    magSize: 5,
    reserve: 15,
    crit: 0.25,
    desc: '高伤害、慢射速',
  },
  pistol: {
    key: 'pistol',
    name: '手枪',
    emoji: '🔫',
    damage: 15,
    range: 5,
    magSize: 12,
    reserve: Infinity,
    crit: 0.08,
    desc: '无限备弹的可靠副武器',
  },
  dagger: {
    key: 'dagger',
    name: '匕首',
    emoji: '🔪',
    damage: 40,
    range: 1,
    magSize: Infinity,
    reserve: Infinity,
    crit: 0.05,
    desc: '近战挥砍',
  },
};

export const HERO_LIST: HeroDef[] = HERO_IDS.map((k) => HERO_DEFS[k]);
export const WEAPON_LIST: WeaponDef[] = WEAPON_IDS.map((k) => WEAPON_DEFS[k]);

export type GameMode = 'ffa' | 'tdm';
export type TeamId = 'A' | 'B';

export interface PlayerConfig {
  id: string;
  name: string;
  isBot?: boolean;
}

export interface EngineOptions {
  mode?: GameMode;
  scoreLimit?: number;
  maxTurns?: number;
  rng?: () => number;
}

// ---------------- 动作类型 ----------------

export type CorcodragonAction =
  | { type: 'selectHero'; hero: HeroId }
  | { type: 'move'; to: Vec }
  | { type: 'shoot'; targetId: string }
  | { type: 'switchWeapon'; weapon: WeaponId }
  | { type: 'reload' }
  | { type: 'skill'; to?: Vec; targetId?: string }
  | { type: 'ult'; to?: Vec; targetId?: string }
  | { type: 'endTurn' };

// ---------------- 视图类型 ----------------

export interface PublicPlayerView {
  id: string;
  name: string;
  isBot: boolean;
  team: TeamId;
  hero: HeroId;
  /** 隐身且非本人时不可见 */
  visible: boolean;
  position: Vec | null;
  hp: number | null;
  maxHp: number;
  shieldHp: number;
  weapon: WeaponId;
  kills: number;
  deaths: number;
  assists: number;
}

export interface PrivateYouView {
  id: string;
  name: string;
  isBot: boolean;
  team: TeamId;
  hero: HeroId;
  position: Vec;
  hp: number;
  maxHp: number;
  shieldHp: number;
  weapon: WeaponId;
  mag: number;
  reserve: number;
  weapons: Record<WeaponId, { mag: number; reserve: number }>;
  skillReady: boolean;
  skillCd: number;
  ultReady: boolean;
  ultCharge: number;
  hasMoved: boolean;
  hasActed: boolean;
  fortressTurns: number;
  moveRange: number;
  moveOptions: Vec[];
  dashOptions: Vec[];
  kills: number;
  deaths: number;
  assists: number;
}

export interface CorcodragonEvent {
  seq: number;
  type:
    | 'info'
    | 'heroSelect'
    | 'turnStart'
    | 'move'
    | 'shoot'
    | 'damage'
    | 'heal'
    | 'skill'
    | 'ult'
    | 'kill'
    | 'respawn'
    | 'reload'
    | 'switch'
    | 'bomb'
    | 'zone'
    | 'gameOver';
  text: string;
  playerId?: string;
  targetId?: string;
  amount?: number;
}

export interface CorcodragonView {
  gameId: string;
  phase: 'heroSelect' | 'playing' | 'gameOver';
  mode: GameMode;
  scoreLimit: number;
  turnNo: number;
  currentPlayerId: string | null;
  youId: string;
  isYourTurn: boolean;
  arena: { size: number; obstacles: Vec[] };
  availableHeroes: HeroId[];
  players: PublicPlayerView[];
  you: PrivateYouView;
  bombs: { id: string; position: Vec; detonateInTurns: number }[];
  zones: {
    id: string;
    kind: 'sound' | 'storm';
    center: Vec;
    radius: number;
    turnsLeft: number;
    team: TeamId;
  }[];
  events: CorcodragonEvent[];
  winnerId: string | null;
  winnerTeam: TeamId | null;
  result: {
    text: string;
    rankings: { id: string; name: string; score: number; kills: number; assists: number; deaths: number }[];
  } | null;
}

// ---------------- 内部状态 ----------------

interface LoadoutSlot {
  mag: number;
  reserve: number;
}

interface InternalPlayer {
  id: string;
  name: string;
  isBot: boolean;
  team: TeamId;
  hero: HeroId | null;
  position: Vec;
  hp: number;
  maxHp: number;
  weapon: WeaponId;
  loadout: Record<WeaponId, LoadoutSlot>;
  skillCd: number;
  ultCharge: number;
  shieldHp: number;
  shieldTurns: number;
  fortressTurns: number;
  stealthTurns: number;
  speedTurns: number;
  slowTurns: number;
  hasMoved: boolean;
  hasActed: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

interface Bomb {
  id: string;
  ownerId: string;
  team: TeamId;
  position: Vec;
  attachedTo: string | null;
  detonateAtTurn: number;
}

interface Zone {
  id: string;
  kind: 'sound' | 'storm';
  casterId: string;
  team: TeamId;
  center: Vec;
  radius: number;
  untilTurn: number;
}

interface Mark {
  targetId: string;
  casterId: string;
  detonateAtTurn: number;
  damage: number;
}


// ---------------- 工具函数 ----------------

export function sameVec(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

export function chebyshev(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isInside(pos: Vec, size: number): boolean {
  return (
    Number.isInteger(pos.x) &&
    Number.isInteger(pos.y) &&
    pos.x >= 0 &&
    pos.x < size &&
    pos.y >= 0 &&
    pos.y < size
  );
}

export function isObstacle(pos: Vec): boolean {
  return OBSTACLES.some((o) => sameVec(o, pos));
}

function cellKey(pos: Vec): string {
  return `${pos.x},${pos.y}`;
}

/** Bresenham 直线经过的格（不含起点，含终点） */
export function lineCells(from: Vec, to: Vec): Vec[] {
  const cells: Vec[] = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (!(x0 === from.x && y0 === from.y)) {
      cells.push({ x: x0, y: y0 });
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
}

/** 直线是否被障碍物阻挡（不含起点） */
export function hasClearLine(from: Vec, to: Vec): boolean {
  return lineCells(from, to).every((c) => !isObstacle(c));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}


// ---------------- 引擎 ----------------

export class CorcodragonEngine {
  phase: 'heroSelect' | 'playing' | 'gameOver';
  mode: GameMode;
  scoreLimit: number;
  maxTurns: number;
  private rng: () => number;
  private players: InternalPlayer[];
  private turnNo = 0;
  private currentIndex = 0;
  private seq = 0;
  private events: CorcodragonEvent[] = [];
  private bombs: Bomb[] = [];
  private zones: Zone[] = [];
  private marks: Mark[] = [];
  private winnerId: string | null = null;
  private winnerTeam: TeamId | null = null;
  private result: CorcodragonView['result'] = null;
  private bombSeq = 0;
  private zoneSeq = 0;

  constructor(players: PlayerConfig[], options: EngineOptions = {}) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 7) {
      throw new Error('玩家数量必须为 2-7');
    }
    this.mode = options.mode === 'tdm' ? 'tdm' : 'ffa';
    this.scoreLimit = clamp(Math.floor(options.scoreLimit ?? DEFAULT_SCORE_LIMIT), 1, 999);
    this.maxTurns = clamp(Math.floor(options.maxTurns ?? DEFAULT_MAX_TURNS), 10, 10000);
    this.rng = options.rng ?? Math.random;
    this.phase = 'heroSelect';

    const heroPool = [...HERO_IDS].sort(() => this.rng() - 0.5);
    this.players = players.map((p, i) => {
      const hero: HeroId | null = p.isBot ? heroPool[i % heroPool.length] : null;
      const loadout = {} as Record<WeaponId, LoadoutSlot>;
      for (const w of WEAPON_IDS) {
        loadout[w] = { mag: WEAPON_DEFS[w].magSize, reserve: WEAPON_DEFS[w].reserve };
      }
      return {
        id: p.id,
        name: p.name || `玩家${i + 1}`,
        isBot: !!p.isBot,
        team: this.mode === 'tdm' ? (i % 2 === 0 ? 'A' : 'B') : 'A',
        hero,
        position: { x: 0, y: 0 },
        hp: 100,
        maxHp: 100,
        weapon: 'rifle',
        loadout,
        skillCd: 0,
        ultCharge: 0,
        shieldHp: 0,
        shieldTurns: 0,
        fortressTurns: 0,
        stealthTurns: 0,
        speedTurns: 0,
        slowTurns: 0,
        hasMoved: false,
        hasActed: false,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
    });

    // 初始站位：棋盘边缘散开
    const spawns: Vec[] = [
      { x: 0, y: 0 },
      { x: ARENA_SIZE - 1, y: ARENA_SIZE - 1 },
      { x: 0, y: ARENA_SIZE - 1 },
      { x: ARENA_SIZE - 1, y: 0 },
      { x: 0, y: Math.floor(ARENA_SIZE / 2) },
      { x: ARENA_SIZE - 1, y: Math.floor(ARENA_SIZE / 2) },
      { x: Math.floor(ARENA_SIZE / 2), y: 0 },
    ];
    this.players.forEach((p, i) => {
      p.position = { ...spawns[i % spawns.length] };
      p.maxHp = p.hero ? HERO_DEFS[p.hero].hp : 100;
      p.hp = p.maxHp;
    });

    // 机器人已在构造时自动选好英雄；若全员已选好则直接开战
    this.maybeStartBattle();
  }

  get currentPlayerId(): string | null {
    if (this.phase !== 'playing') return null;
    return this.players[this.currentIndex]?.id ?? null;
  }

  get playersCount(): number {
    return this.players.length;
  }

  private log(
    type: CorcodragonEvent['type'],
    text: string,
    extra: Partial<CorcodragonEvent> = {},
  ): void {
    this.events.push({ seq: ++this.seq, type, text, ...extra } as CorcodragonEvent);
  }

  private player(id: string): InternalPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  private alive(p: InternalPlayer): boolean {
    return p.hp > 0;
  }

  private isStealthed(p: InternalPlayer): boolean {
    return p.stealthTurns > 0;
  }

  private isVisibleTo(viewerId: string, target: InternalPlayer): boolean {
    if (viewerId === target.id) return true;
    if (!this.isStealthed(target)) return true;
    // 死亡标记会暴露位置：若目标身上有当前观察者施加的标记，则可见
    return this.marks.some((m) => m.targetId === target.id && m.casterId === viewerId);
  }

  private isEnemy(a: InternalPlayer, b: InternalPlayer): boolean {
    if (a.id === b.id) return false;
    if (this.mode === 'tdm') return a.team !== b.team;
    return true;
  }

  private freeCells(): Vec[] {
    const occupied = new Set(
      this.players.filter((p) => this.alive(p)).map((p) => cellKey(p.position)),
    );
    const cells: Vec[] = [];
    for (let y = 0; y < ARENA_SIZE; y++) {
      for (let x = 0; x < ARENA_SIZE; x++) {
        const c = { x, y };
        if (!isObstacle(c) && !occupied.has(cellKey(c))) cells.push(c);
      }
    }
    return cells;
  }

  private randomFreeCell(): Vec {
    const cells = this.freeCells();
    if (cells.length === 0) return { x: 0, y: 0 };
    return cells[Math.floor(this.rng() * cells.length)];
  }

  private moveRangeOf(p: InternalPlayer): number {
    const hero = p.hero ? HERO_DEFS[p.hero].moveRange : 3;
    let range = hero;
    if (p.stealthTurns > 0) range += 1;
    if (p.speedTurns > 0) range += 1;
    if (p.slowTurns > 0) range -= 1;
    return Math.max(1, range);
  }

  private reachableCells(p: InternalPlayer): Vec[] {
    const range = this.moveRangeOf(p);
    const occupied = new Set(
      this.players.filter((o) => o.id !== p.id && this.alive(o)).map((o) => cellKey(o.position)),
    );
    const start = p.position;
    const queue: Vec[] = [start];
    const dist = new Map<string, number>([[cellKey(start), 0]]);
    const out: Vec[] = [];
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      const d = dist.get(cellKey(cur))!;
      if (d > 0) out.push(cur);
      if (d >= range) continue;
      for (const dir of dirs) {
        const next = { x: cur.x + dir.x, y: cur.y + dir.y };
        if (!isInside(next, ARENA_SIZE)) continue;
        if (isObstacle(next)) continue;
        if (occupied.has(cellKey(next))) continue;
        if (dist.has(cellKey(next))) continue;
        dist.set(cellKey(next), d + 1);
        queue.push(next);
      }
    }
    return out;
  }

  /** 直线冲刺的合法落点（炎刃技能） */
  private dashOptions(p: InternalPlayer): Vec[] {
    const maxDist = 4;
    const out: Vec[] = [];
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
    ];
    const occupied = new Set(
      this.players.filter((o) => o.id !== p.id && this.alive(o)).map((o) => cellKey(o.position)),
    );
    for (const dir of dirs) {
      for (let dist = 1; dist <= maxDist; dist++) {
        const c = { x: p.position.x + dir.x * dist, y: p.position.y + dir.y * dist };
        if (!isInside(c, ARENA_SIZE) || isObstacle(c)) break;
        if (occupied.has(cellKey(c))) break;
        out.push(c);
      }
    }
    return out;
  }

  private maybeStartBattle(): void {
    if (this.phase !== 'heroSelect') return;
    if (this.players.some((p) => !p.hero)) return;
    this.phase = 'playing';
    this.startTurn(0);
  }


  private startTurn(index: number): void {
    this.turnNo += 1;
    this.currentIndex = ((index % this.players.length) + this.players.length) % this.players.length;
    const p = this.players[this.currentIndex];

    // 回合开始阶段：先结算全局延迟效果（雷暴云、音障领域、粘性炸弹、死亡标记）
    this.tickDelayedEffects(p);

    // 若上一阶段结算导致游戏结束，则不再继续回合
    if (this.phase === 'gameOver') return;

    // 死亡玩家在自己的回合开始时复活
    if (!this.alive(p)) {
      this.respawnPlayer(p);
    }

    // 自身状态回合衰减
    p.skillCd = Math.max(0, p.skillCd - 1);
    p.shieldTurns = Math.max(0, p.shieldTurns - 1);
    if (p.shieldTurns === 0) p.shieldHp = 0;
    p.fortressTurns = Math.max(0, p.fortressTurns - 1);
    p.stealthTurns = Math.max(0, p.stealthTurns - 1);
    p.speedTurns = Math.max(0, p.speedTurns - 1);
    p.slowTurns = Math.max(0, p.slowTurns - 1);
    p.ultCharge = Math.min(100, p.ultCharge + 5);
    p.hasMoved = false;
    p.hasActed = false;

    this.log('turnStart', `第 ${this.turnNo} 回合 · 轮到 ${p.name}${p.isBot ? ' 🤖' : ''} 行动`, {
      playerId: p.id,
    });
  }

  private tickDelayedEffects(current: InternalPlayer): void {
    // 音障领域：己方回合开始时回复并加速（仅存活者）
    for (const z of this.zones) {
      if (z.kind !== 'sound') continue;
      if (!this.alive(current)) continue;
      if (chebyshev(current.position, z.center) > z.radius) continue;
      const friendly = this.mode === 'ffa' ? current.id === z.casterId : current.team === z.team;
      if (!friendly) continue;
      const healed = Math.min(current.maxHp - current.hp, 20);
      if (healed > 0) {
        current.hp += healed;
        this.log('heal', `${current.name} 在音障领域中回复 ${healed} 生命`, {
          playerId: current.id,
          amount: healed,
        });
      }
      current.speedTurns = Math.max(current.speedTurns, 1);
    }

    // 雷暴云：敌方回合开始时伤害并减速（仅存活者）
    for (const z of this.zones) {
      if (z.kind !== 'storm') continue;
      if (!this.alive(current)) continue;
      if (chebyshev(current.position, z.center) > z.radius) continue;
      const enemy = this.mode === 'ffa' ? current.id !== z.casterId : current.team !== z.team;
      if (!enemy) continue;
      this.damagePlayer(current, z.casterId, 20, '雷暴云');
      current.slowTurns = Math.max(current.slowTurns, 1);
    }

    // 粘性炸弹：到点爆炸
    const dueBombs = this.bombs.filter((b) => this.turnNo >= b.detonateAtTurn);
    for (const b of dueBombs) {
      this.detonateBomb(b);
    }
    if (dueBombs.length > 0) {
      this.bombs = this.bombs.filter((b) => this.turnNo < b.detonateAtTurn);
    }

    // 死亡标记：到点造成伤害
    const dueMarks = this.marks.filter((m) => this.turnNo >= m.detonateAtTurn);
    for (const m of dueMarks) {
      const target = this.player(m.targetId);
      if (target && this.alive(target)) {
        this.damagePlayer(target, m.casterId, m.damage, '死亡标记');
      }
    }
    if (dueMarks.length > 0) {
      this.marks = this.marks.filter((m) => this.turnNo < m.detonateAtTurn);
    }

    // 清理过期区域
    this.zones = this.zones.filter((z) => this.turnNo <= z.untilTurn);

    this.checkWin();
  }

  private detonateBomb(b: Bomb): void {
    const pos = b.attachedTo ? (this.player(b.attachedTo)?.position ?? b.position) : b.position;
    const targets = this.players.filter((p) => {
      if (!this.alive(p)) return false;
      if (chebyshev(p.position, pos) > 1) return false;
      if (this.mode === 'tdm') return p.team !== b.team;
      return p.id !== b.ownerId;
    });
    for (const t of targets) {
      this.damagePlayer(t, b.ownerId, 35, '粘性炸弹');
    }
    this.log(
      'bomb',
      targets.length > 0 ? `💣 粘性炸弹爆炸，命中 ${targets.length} 名敌人` : '💣 粘性炸弹爆炸，未命中敌人',
      { playerId: b.ownerId },
    );
  }

  private respawnPlayer(p: InternalPlayer): void {
    const pos = this.randomFreeCell();
    p.position = pos;
    p.hp = p.maxHp;
    p.shieldHp = 0;
    p.shieldTurns = 0;
    p.fortressTurns = 0;
    p.stealthTurns = 0;
    p.speedTurns = 0;
    p.slowTurns = 0;
    // 清除以其为目标的死亡标记
    this.marks = this.marks.filter((m) => m.targetId !== p.id);
    this.log('respawn', `${p.name} 重生在 (${pos.x}, ${pos.y})`, { playerId: p.id });
  }

  private damagePlayer(
    target: InternalPlayer,
    attackerId: string | null,
    rawDamage: number,
    source: string,
  ): number {
    if (!this.alive(target)) return 0;
    let amount = Math.max(1, Math.floor(rawDamage));
    // 堡垒模式减伤
    if (target.fortressTurns > 0) {
      amount = Math.max(5, Math.floor(amount * 0.7));
    }
    // 护盾先吸收
    if (target.shieldHp > 0) {
      const absorbed = Math.min(target.shieldHp, amount);
      target.shieldHp -= absorbed;
      amount -= absorbed;
      this.log('damage', `${target.name} 的护盾吸收了 ${absorbed} 伤害（${source}）`, {
        playerId: target.id,
        targetId: target.id,
        amount: absorbed,
      });
    }
    if (amount > 0) {
      target.hp -= amount;
      this.log('damage', `${target.name} 受到 ${amount} 伤害（${source}）`, {
        playerId: attackerId ?? target.id,
        targetId: target.id,
        amount,
      });
    }

    // 攻击者积攒终极技能充能
    if (attackerId) {
      const attacker = this.player(attackerId);
      if (attacker) {
        attacker.ultCharge = Math.min(
          100,
          attacker.ultCharge + Math.max(1, Math.floor(rawDamage / 4)),
        );
      }
    }
    this.recordAssist(attackerId, target.id, rawDamage);

    if (target.hp <= 0) {
      target.hp = 0;
      if (attackerId) this.handleKill(attackerId, target.id);
    }
    return amount;
  }

  private assistLog = new Map<string, Map<string, number>>();

  private recordAssist(attackerId: string | null, targetId: string, amount: number): void {
    if (!attackerId || attackerId === targetId) return;
    let map = this.assistLog.get(targetId);
    if (!map) {
      map = new Map();
      this.assistLog.set(targetId, map);
    }
    map.set(attackerId, (map.get(attackerId) ?? 0) + amount);
  }

  private handleKill(killerId: string, victimId: string): void {
    const killer = this.player(killerId);
    const victim = this.player(victimId);
    if (!killer || !victim) return;
    killer.kills += 1;
    victim.deaths += 1;
    killer.ultCharge = Math.min(100, killer.ultCharge + 40);
    this.log('kill', `☠️ ${killer.name} 击杀了 ${victim.name}！`, {
      playerId: killerId,
      targetId: victimId,
    });

    // 助攻：最近对受害者造成过伤害的其他敌人
    const contributors = this.assistLog.get(victimId);
    if (contributors) {
      for (const [id, amount] of contributors) {
        if (id !== killerId && amount >= 10) {
          const assister = this.player(id);
          if (assister && this.isEnemy(assister, victim)) {
            assister.assists += 1;
            this.log('info', `${assister.name} 获得助攻 +1`, { playerId: id });
          }
        }
      }
    }
    this.assistLog.delete(victimId);

    // 清除受害者身上的炸弹与标记
    this.bombs = this.bombs.filter((b) => b.attachedTo !== victimId);
    this.marks = this.marks.filter((m) => m.targetId !== victimId);

    this.checkWin();
  }

  private checkWin(): void {
    if (this.phase === 'gameOver') return;
    let winnerId: string | null = null;
    let winnerTeam: TeamId | null = null;
    if (this.mode === 'ffa') {
      const top = [...this.players].sort(
        (a, b) => b.kills - a.kills || b.assists - a.assists,
      )[0];
      if (top && top.kills >= this.scoreLimit) winnerId = top.id;
    } else {
      const teamKills = (team: TeamId) =>
        this.players.filter((p) => p.team === team).reduce((s, p) => s + p.kills, 0);
      if (teamKills('A') >= this.scoreLimit) winnerTeam = 'A';
      else if (teamKills('B') >= this.scoreLimit) winnerTeam = 'B';
    }

    // 回合上限兜底
    if (!winnerId && !winnerTeam && this.turnNo >= this.maxTurns) {
      if (this.mode === 'ffa') {
        winnerId = [...this.players].sort(
          (a, b) => b.kills - a.kills || b.assists - a.assists,
        )[0].id;
      } else {
        const teamKills = (team: TeamId) =>
          this.players.filter((p) => p.team === team).reduce((s, p) => s + p.kills, 0);
        winnerTeam = teamKills('A') >= teamKills('B') ? 'A' : 'B';
      }
    }
    if (!winnerId && !winnerTeam) return;

    this.phase = 'gameOver';
    this.winnerId = winnerId;
    this.winnerTeam = winnerTeam;
    const rankings = [...this.players]
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: this.scoreOf(p),
        kills: p.kills,
        assists: p.assists,
        deaths: p.deaths,
      }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills);
    const winnerName = winnerId
      ? this.player(winnerId)?.name
      : winnerTeam === 'A'
        ? 'A 队'
        : 'B 队';
    this.result = { text: `🏆 ${winnerName} 获胜！`, rankings };
    this.log('gameOver', this.result.text);
  }

  private scoreOf(p: InternalPlayer): number {
    return p.kills + p.assists * 0.5;
  }


  // ---------------- 动作校验与执行 ----------------

  apply(playerId: string, action: unknown): { ok: boolean; error?: string } {
    try {
      const a = action as CorcodragonAction;
      if (!a || typeof a !== 'object' || typeof a.type !== 'string') {
        return { ok: false, error: '非法动作' };
      }
      const p = this.player(playerId);
      if (!p) return { ok: false, error: '玩家不存在' };

      if (this.phase === 'heroSelect') {
        return this.applyHeroSelect(p, a);
      }
      if (this.phase === 'gameOver') {
        return { ok: false, error: '对局已结束' };
      }
      if (this.phase !== 'playing') {
        return { ok: false, error: '当前阶段不可行动' };
      }
      if (this.currentPlayerId !== playerId) {
        return { ok: false, error: '还没轮到你行动' };
      }
      return this.applyPlaying(p, a);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '动作处理失败' };
    }
  }

  private applyHeroSelect(
    p: InternalPlayer,
    a: CorcodragonAction,
  ): { ok: boolean; error?: string } {
    if (a.type !== 'selectHero') return { ok: false, error: '请先选择英雄' };
    if (!isHeroId(a.hero)) return { ok: false, error: '英雄不存在' };
    p.hero = a.hero;
    p.maxHp = HERO_DEFS[a.hero].hp;
    p.hp = p.maxHp;
    this.log('heroSelect', `${p.name} 选择了英雄「${HERO_DEFS[a.hero].name}」`, {
      playerId: p.id,
    });
    this.maybeStartBattle();
    return { ok: true };
  }

  private applyPlaying(
    p: InternalPlayer,
    a: CorcodragonAction,
  ): { ok: boolean; error?: string } {
    switch (a.type) {
      case 'move':
        return this.doMove(p, a.to);
      case 'switchWeapon':
        return this.doSwitchWeapon(p, a.weapon);
      case 'shoot':
        return this.doShoot(p, a.targetId);
      case 'reload':
        return this.doReload(p);
      case 'skill':
        return this.doSkill(p, a);
      case 'ult':
        return this.doUlt(p, a);
      case 'endTurn':
        return this.doEndTurn(p);
      default:
        return { ok: false, error: `未知动作 ${String((a as { type?: string }).type)}` };
    }
  }

  private doMove(p: InternalPlayer, to: unknown): { ok: boolean; error?: string } {
    if (!isVec(to)) return { ok: false, error: '移动目标无效' };
    if (p.hasMoved) return { ok: false, error: '本回合已经移动过' };
    const options = this.reachableCells(p);
    if (!options.some((c) => sameVec(c, to))) {
      return { ok: false, error: '目标格不可到达' };
    }
    p.position = { x: to.x, y: to.y };
    p.hasMoved = true;
    this.log('move', `${p.name} 移动到 (${to.x}, ${to.y})`, { playerId: p.id });
    return { ok: true };
  }

  private doSwitchWeapon(p: InternalPlayer, weapon: unknown): { ok: boolean; error?: string } {
    if (!isWeaponId(weapon)) return { ok: false, error: '武器不存在' };
    if (p.weapon === weapon) {
      return { ok: false, error: `已经在使用${WEAPON_DEFS[weapon].name}` };
    }
    p.weapon = weapon;
    this.log('switch', `${p.name} 切换到${WEAPON_DEFS[weapon].name}`, { playerId: p.id });
    return { ok: true };
  }

  private doShoot(p: InternalPlayer, targetId: unknown): { ok: boolean; error?: string } {
    if (typeof targetId !== 'string') return { ok: false, error: '射击目标无效' };
    if (p.hasActed) return { ok: false, error: '本回合已经行动过' };
    const target = this.player(targetId);
    if (!target) return { ok: false, error: '目标不存在' };
    if (target.id === p.id) return { ok: false, error: '不能射击自己' };
    if (!this.alive(target)) return { ok: false, error: '目标已倒地' };
    if (!this.isVisibleTo(p.id, target)) {
      return { ok: false, error: '目标不可见（可能处于隐身状态）' };
    }
    if (this.mode === 'tdm' && p.team === target.team) {
      return { ok: false, error: '不能射击队友' };
    }
    const weapon = WEAPON_DEFS[p.weapon];
    const slot = p.loadout[p.weapon];
    if (p.weapon !== 'dagger' && slot.mag <= 0) {
      return { ok: false, error: '弹匣已空，请先装弹或切换武器' };
    }
    const dist = chebyshev(p.position, target.position);
    let range = weapon.range;
    if (p.fortressTurns > 0) range += 2;
    if (dist > range) return { ok: false, error: '目标超出射程' };
    if (!hasClearLine(p.position, target.position)) {
      return { ok: false, error: '视线被掩体阻挡' };
    }

    // 消耗弹药
    if (p.weapon !== 'dagger') slot.mag -= 1;
    p.hasActed = true;

    const hitChance = clamp(0.95 - Math.max(0, dist - 1) * 0.04, 0.15, 0.95);
    if (this.rng() > hitChance) {
      this.log('shoot', `${p.name} 使用${weapon.name}射击 ${target.name}，未命中`, {
        playerId: p.id,
        targetId: target.id,
      });
      return { ok: true };
    }

    let dmg = weapon.damage;
    let crit = false;
    if (p.stealthTurns > 0) {
      // 隐身第一击暴击
      dmg *= 2;
      crit = true;
      p.stealthTurns = 0;
    } else if (this.rng() < weapon.crit) {
      dmg *= 2;
      crit = true;
    }
    dmg = Math.floor(dmg);
    this.damagePlayer(target, p.id, dmg, `${weapon.name}${crit ? '·暴击' : ''}`);
    this.log(
      'shoot',
      `${p.name} 使用${weapon.name}命中 ${target.name}，造成 ${dmg} 伤害${crit ? '（暴击）' : ''}`,
      { playerId: p.id, targetId: target.id, amount: dmg },
    );
    return { ok: true };
  }

  private doReload(p: InternalPlayer): { ok: boolean; error?: string } {
    if (p.hasActed) return { ok: false, error: '本回合已经行动过' };
    if (p.weapon === 'dagger') return { ok: false, error: '匕首无需装弹' };
    const weapon = WEAPON_DEFS[p.weapon];
    const slot = p.loadout[p.weapon];
    if (slot.mag >= weapon.magSize) return { ok: false, error: '弹匣已满' };
    if (slot.reserve <= 0) return { ok: false, error: '无备用弹药' };
    const needed = weapon.magSize - slot.mag;
    const take = Math.min(needed, slot.reserve);
    slot.mag += take;
    if (slot.reserve !== Infinity) slot.reserve -= take;
    p.hasActed = true;
    this.log('reload', `${p.name} 为${weapon.name}装弹（+${take}）`, { playerId: p.id });
    return { ok: true };
  }


  private doSkill(p: InternalPlayer, a: { to?: Vec; targetId?: string }): { ok: boolean; error?: string } {
    if (p.hasActed) return { ok: false, error: '本回合已经行动过' };
    if (!p.hero) return { ok: false, error: '尚未选择英雄' };
    if (p.skillCd > 0) return { ok: false, error: `技能冷却中（${p.skillCd} 回合）` };
    const hero = HERO_DEFS[p.hero];
    switch (p.hero) {
      case 'yanren': {
        if (!isVec(a.to)) return { ok: false, error: '请选择冲刺目标格' };
        const options = this.dashOptions(p);
        if (!options.some((c) => sameVec(c, a.to!))) {
          return { ok: false, error: '冲刺目标格无效' };
        }
        p.position = { x: a.to!.x, y: a.to!.y };
        p.hasActed = true;
        p.skillCd = hero.skillCooldown;
        this.log('skill', `${p.name} 烈焰冲刺至 (${a.to!.x}, ${a.to!.y})`, {
          playerId: p.id,
        });
        const targets = this.players.filter(
          (o) => o.id !== p.id && this.alive(o) && chebyshev(o.position, p.position) <= 1,
        );
        for (const t of targets) {
          this.damagePlayer(t, p.id, 20, '烈焰冲刺');
        }
        if (p.stealthTurns > 0) p.stealthTurns = 0;
        return { ok: true };
      }
      case 'yingxiao': {
        p.hasActed = true;
        p.skillCd = hero.skillCooldown;
        p.stealthTurns = Math.max(p.stealthTurns, 2);
        this.log('skill', `${p.name} 进入暗影潜行`, { playerId: p.id });
        return { ok: true };
      }
      case 'tiebi': {
        p.hasActed = true;
        p.skillCd = hero.skillCooldown;
        p.shieldHp = 80;
        p.shieldTurns = 2;
        this.log('skill', `${p.name} 展开能量护盾（80 点）`, { playerId: p.id });
        return { ok: true };
      }
      case 'lingyin': {
        p.hasActed = true;
        p.skillCd = hero.skillCooldown;
        const healed = Math.min(p.maxHp - p.hp, 30);
        if (healed > 0) {
          p.hp += healed;
          this.log('heal', `${p.name} 治愈波为自己回复 ${healed} 生命`, {
            playerId: p.id,
            amount: healed,
          });
        }
        if (this.mode === 'tdm') {
          for (const ally of this.players) {
            if (ally.id === p.id || ally.team !== p.team || !this.alive(ally)) continue;
            if (chebyshev(ally.position, p.position) > 3) continue;
            const h = Math.min(ally.maxHp - ally.hp, 30);
            if (h > 0) {
              ally.hp += h;
              this.log('heal', `${ally.name} 受到治愈波回复 ${h} 生命`, {
                playerId: ally.id,
                amount: h,
              });
            }
          }
        }
        this.log('skill', `${p.name} 释放治愈波`, { playerId: p.id });
        return { ok: true };
      }
      case 'guilei': {
        const pos = this.bombTargetPosition(p, a);
        if (!pos) return { ok: false, error: '请选择投掷目标格或可见敌人' };
        p.hasActed = true;
        p.skillCd = hero.skillCooldown;
        const bomb: Bomb = {
          id: `bomb-${++this.bombSeq}`,
          ownerId: p.id,
          team: p.team,
          position: { ...pos },
          attachedTo:
            typeof a.targetId === 'string' && this.isEnemyTarget(p, a.targetId)
              ? a.targetId
              : null,
          detonateAtTurn: this.turnNo + 2,
        };
        this.bombs.push(bomb);
        this.log('skill', `${p.name} 投掷粘性炸弹到 (${pos.x}, ${pos.y})`, {
          playerId: p.id,
        });
        if (p.stealthTurns > 0) p.stealthTurns = 0;
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知英雄' };
    }
  }

  private bombTargetPosition(p: InternalPlayer, a: { to?: Vec; targetId?: string }): Vec | null {
    if (isVec(a.to)) {
      if (!isInside(a.to, ARENA_SIZE) || isObstacle(a.to)) return null;
      if (
        this.players.some(
          (o) => o.id !== p.id && this.alive(o) && sameVec(o.position, a.to!),
        )
      ) {
        return null;
      }
      if (chebyshev(p.position, a.to) > 6) return null;
      return { x: a.to.x, y: a.to.y };
    }
    if (typeof a.targetId === 'string') {
      const target = this.player(a.targetId);
      if (!target || target.id === p.id || !this.alive(target)) return null;
      if (!this.isVisibleTo(p.id, target)) return null;
      if (this.mode === 'tdm' && p.team === target.team) return null;
      if (chebyshev(p.position, target.position) > 6) return null;
      return { ...target.position };
    }
    return null;
  }

  private isEnemyTarget(p: InternalPlayer, targetId: string): boolean {
    const t = this.player(targetId);
    if (!t || t.id === p.id || !this.alive(t)) return false;
    if (this.mode === 'tdm' && p.team === t.team) return false;
    return true;
  }

  private doUlt(p: InternalPlayer, a: { to?: Vec; targetId?: string }): { ok: boolean; error?: string } {
    if (p.hasActed) return { ok: false, error: '本回合已经行动过' };
    if (!p.hero) return { ok: false, error: '尚未选择英雄' };
    if (p.ultCharge < 100) return { ok: false, error: '终极技能充能不足' };
    switch (p.hero) {
      case 'yanren': {
        p.hasActed = true;
        p.ultCharge = 0;
        this.log('ult', `${p.name} 释放焚天烈焰！`, { playerId: p.id });
        const targets = this.players.filter(
          (o) => o.id !== p.id && this.alive(o) && chebyshev(o.position, p.position) <= 2,
        );
        for (const t of targets) {
          this.damagePlayer(t, p.id, 60, '焚天烈焰');
        }
        if (p.stealthTurns > 0) p.stealthTurns = 0;
        return { ok: true };
      }
      case 'yingxiao': {
        if (typeof a.targetId !== 'string') {
          return { ok: false, error: '请选择死亡标记目标' };
        }
        const target = this.player(a.targetId);
        if (!target || target.id === p.id || !this.alive(target)) {
          return { ok: false, error: '目标无效' };
        }
        if (!this.isVisibleTo(p.id, target)) return { ok: false, error: '目标不可见' };
        if (this.mode === 'tdm' && p.team === target.team) {
          return { ok: false, error: '不能标记队友' };
        }
        if (chebyshev(p.position, target.position) > 6) {
          return { ok: false, error: '目标超出 6 格' };
        }
        p.hasActed = true;
        p.ultCharge = 0;
        this.marks.push({
          targetId: target.id,
          casterId: p.id,
          detonateAtTurn: this.turnNo + 3,
          damage: 80,
        });
        this.log('ult', `${p.name} 对 ${target.name} 施加死亡标记`, {
          playerId: p.id,
          targetId: target.id,
        });
        return { ok: true };
      }
      case 'tiebi': {
        p.hasActed = true;
        p.ultCharge = 0;
        p.fortressTurns = Math.max(p.fortressTurns, 3);
        this.log('ult', `${p.name} 架设堡垒模式（3 回合）`, { playerId: p.id });
        return { ok: true };
      }
      case 'lingyin': {
        let center = p.position;
        if (isVec(a.to)) {
          if (!isInside(a.to, ARENA_SIZE) || isObstacle(a.to)) {
            return { ok: false, error: '领域位置无效' };
          }
          if (chebyshev(p.position, a.to) > 4) {
            return { ok: false, error: '领域位置超出 4 格' };
          }
          center = { x: a.to.x, y: a.to.y };
        }
        p.hasActed = true;
        p.ultCharge = 0;
        this.zones.push({
          id: `zone-${++this.zoneSeq}`,
          kind: 'sound',
          casterId: p.id,
          team: p.team,
          center,
          radius: 2,
          untilTurn: this.turnNo + 2,
        });
        this.log('ult', `${p.name} 创造音障领域`, { playerId: p.id });
        return { ok: true };
      }
      case 'guilei': {
        if (!isVec(a.to)) return { ok: false, error: '请选择雷暴云中心' };
        if (!isInside(a.to, ARENA_SIZE) || isObstacle(a.to)) {
          return { ok: false, error: '雷暴云位置无效' };
        }
        if (chebyshev(p.position, a.to) > 6) {
          return { ok: false, error: '雷暴云位置超出 6 格' };
        }
        p.hasActed = true;
        p.ultCharge = 0;
        this.zones.push({
          id: `zone-${++this.zoneSeq}`,
          kind: 'storm',
          casterId: p.id,
          team: p.team,
          center: { x: a.to.x, y: a.to.y },
          radius: 2,
          untilTurn: this.turnNo + 3,
        });
        this.log('ult', `${p.name} 召唤雷暴云`, { playerId: p.id });
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知英雄' };
    }
  }

  private doEndTurn(p: InternalPlayer): { ok: boolean; error?: string } {
    void p;
    if (this.phase !== 'playing') return { ok: false, error: '当前阶段不可结束回合' };
    this.startTurn(this.currentIndex + 1);
    return { ok: true };
  }


  // ---------------- 视图投影 ----------------

  getView(playerId: string): CorcodragonView {
    const viewer = this.player(playerId);
    if (!viewer) {
      throw new Error('玩家不存在');
    }
    const publicPlayers: PublicPlayerView[] = this.players.map((p) => {
      const visible = this.isVisibleTo(playerId, p);
      const isYou = p.id === playerId;
      return {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        team: p.team,
        hero: p.hero ?? HERO_IDS[0],
        visible: isYou || visible,
        position: isYou || visible ? { ...p.position } : null,
        hp: isYou || visible ? p.hp : null,
        maxHp: p.maxHp,
        shieldHp: isYou || visible ? p.shieldHp : 0,
        weapon: isYou || visible ? p.weapon : 'rifle',
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
      };
    });

    const you = viewer;
    const isYourTurn = this.currentPlayerId === playerId && this.phase === 'playing';
    const moveOptions = isYourTurn ? this.reachableCells(you) : [];
    const dashOptions = isYourTurn ? this.dashOptions(you) : [];
    const slot = you.loadout[you.weapon];

    return {
      gameId: GAME_ID,
      phase: this.phase,
      mode: this.mode,
      scoreLimit: this.scoreLimit,
      turnNo: this.turnNo,
      currentPlayerId: this.currentPlayerId,
      youId: playerId,
      isYourTurn,
      arena: { size: ARENA_SIZE, obstacles: OBSTACLES.map((o) => ({ ...o })) },
      availableHeroes: HERO_IDS.filter(
        (h) => !this.players.some((p) => p.hero === h && p.id !== playerId),
      ),
      players: publicPlayers,
      you: {
        id: you.id,
        name: you.name,
        isBot: you.isBot,
        team: you.team,
        hero: you.hero ?? HERO_IDS[0],
        position: { ...you.position },
        hp: you.hp,
        maxHp: you.maxHp,
        shieldHp: you.shieldHp,
        weapon: you.weapon,
        mag: slot.mag,
        reserve: slot.reserve,
        weapons: Object.fromEntries(
          WEAPON_IDS.map((w) => [w, { mag: you.loadout[w].mag, reserve: you.loadout[w].reserve }]),
        ) as Record<WeaponId, { mag: number; reserve: number }>,
        skillReady: you.skillCd === 0 && !!you.hero,
        skillCd: you.skillCd,
        ultReady: you.ultCharge >= 100,
        ultCharge: you.ultCharge,
        hasMoved: you.hasMoved,
        hasActed: you.hasActed,
        fortressTurns: you.fortressTurns,
        moveRange: this.moveRangeOf(you),
        moveOptions,
        dashOptions,
        kills: you.kills,
        deaths: you.deaths,
        assists: you.assists,
      },
      bombs: this.bombs.map((b) => ({
        id: b.id,
        position: { ...b.position },
        detonateInTurns: Math.max(0, b.detonateAtTurn - this.turnNo),
      })),
      zones: this.zones.map((z) => ({
        id: z.id,
        kind: z.kind,
        center: { ...z.center },
        radius: z.radius,
        turnsLeft: Math.max(0, z.untilTurn - this.turnNo),
        team: z.team,
      })),
      events: [...this.events],
      winnerId: this.winnerId,
      winnerTeam: this.winnerTeam,
      result: this.result,
    };
  }
}

// ---------------- 类型守卫 ----------------

export function isHeroId(v: unknown): v is HeroId {
  return typeof v === 'string' && (HERO_IDS as readonly string[]).includes(v);
}

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && (WEAPON_IDS as readonly string[]).includes(v);
}

export function isVec(v: unknown): v is Vec {
  if (!v || typeof v !== 'object') return false;
  const o = v as { x?: unknown; y?: unknown };
  return Number.isInteger(o.x) && Number.isInteger(o.y);
}

/** 适配平台 GameEngine 契约 */
export class CorcodragonGameEngine {
  constructor(private engine: CorcodragonEngine) {}
  get phase(): string {
    return this.engine.phase;
  }
  getView(playerId: string): unknown {
    return this.engine.getView(playerId);
  }
  apply(playerId: string, action: unknown): { ok: boolean; error?: string } {
    return this.engine.apply(playerId, action);
  }
}

