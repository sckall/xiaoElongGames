/**
 * 《鳄龙咆哮》实时 FPS 引擎定义层：常量 / 英雄 / 武器 / 竞技场 / 动作与快照类型。
 *
 * 本文件是引擎（engine.ts）、AI（ai.ts）、平台（apps/server/apps/web）与 3D 客户端
 * （GameUI.tsx）共享的“唯一事实源”。纯 TS、零依赖。
 */

import { BALANCE } from './balance';

export const GAME_ID = 'corcodragon-fight';
export const GAME_NAME = '鳄龙咆哮';
/**
 * 手感/玩法数值以 gameplay.json + balance.ts 为唯一事实源。
 * 以下导出是“模块加载时快照”，用于渲染/几何/测试；引擎运行时实时数值
 * 直接读 BALANCE（见 engine.ts / GameUI.tsx 的调试面板热更新）。
 */
export const TICK_MS = BALANCE.tick.stepMs;
export const ARENA_HALF = BALANCE.arena.half;
export const WALL_HEIGHT = BALANCE.arena.wallHeight;

export const HERO_IDS = ['yanren', 'yingxiao', 'tiebi', 'lingyin', 'guilei'] as const;
export type HeroId = (typeof HERO_IDS)[number];

export const WEAPON_IDS = ['rifle', 'sniper', 'pistol', 'dagger'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export type TeamId = 'A' | 'B';
export type GameModeKind = 'ffa' | 'tdm';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 顶面高度（用于渲染与视线阻挡） */
  height: number;
}

export interface HeroDef {
  key: HeroId;
  name: string;
  emoji: string;
  role: string;
  hp: number;
  speed: number;
  skillName: string;
  skillDesc: string;
  skillCd: number;
  ultName: string;
  ultDesc: string;
}

export interface WeaponDef {
  key: WeaponId;
  name: string;
  emoji: string;
  damage: number;
  /** 两次射击最小间隔（毫秒） */
  interval: number;
  magSize: number;
  /** Infinity = 无限备弹 */
  reserve: number;
  reloadMs: number;
  range: number;
  /** 开镜 FOV（度） */
  adsFov: number;
  /** 单发视角上跳（弧度，客户端后坐表现） */
  recoil: number;
  /** 腰射散布（弧度，±） */
  spread: number;
  /** 开镜散布（弧度，±） */
  adsSpread: number;
  /** 爆头倍率 */
  headshot: number;
  falloffStart: number;
  falloffEnd: number;
  /** 超出 falloffEnd 后的最低伤害倍率 */
  minDmgMult: number;
  /** 近战（不消耗弹药、锥形判定） */
  melee?: boolean;
  desc: string;
}

function heroDefOf(key: HeroId): HeroDef {
  const h = BALANCE.heroes[key];
  return {
    key,
    name: h.name,
    emoji: h.emoji,
    role: h.role,
    hp: h.hp,
    speed: h.speed,
    skillName: h.skillName,
    skillDesc: h.skillDesc,
    skillCd: h.skillCd,
    ultName: h.ultName,
    ultDesc: h.ultDesc,
  };
}

function weaponDefOf(key: WeaponId): WeaponDef {
  const w = BALANCE.weapons[key];
  return {
    key,
    name: w.name,
    emoji: w.emoji,
    damage: w.damage,
    interval: w.interval,
    magSize: w.magSize === -1 ? Infinity : w.magSize,
    reserve: w.reserve === -1 ? Infinity : w.reserve,
    reloadMs: w.reloadMs,
    range: w.range,
    adsFov: w.adsFov,
    recoil: w.recoil,
    spread: w.spread,
    adsSpread: w.adsSpread,
    headshot: w.headshot,
    falloffStart: w.falloffStart,
    falloffEnd: w.falloffEnd,
    minDmgMult: w.minDmgMult,
    melee: w.melee,
    desc: w.desc,
  };
}

/**
 * 代理对象：每次访问都从 BALANCE 现取数值 → tweakpane 热更新后，
 * 引擎/HUD/AI 无需刷新引用即可生效（结构字段除外，见 GAMEPLAY-TUNING.md）。
 */
export const HERO_DEFS = new Proxy({} as Record<HeroId, HeroDef>, {
  get: (_target, key: string) => heroDefOf(key as HeroId),
});

export const WEAPON_DEFS = new Proxy({} as Record<WeaponId, WeaponDef>, {
  get: (_target, key: string) => weaponDefOf(key as WeaponId),
});

export const HERO_LIST: HeroDef[] = HERO_IDS.map((k) => HERO_DEFS[k]);
export const WEAPON_LIST: WeaponDef[] = WEAPON_IDS.map((k) => WEAPON_DEFS[k]);

/** 竞技场掩体（不可通行、阻挡视线与弹道）。单位：米，Y=0 为地面。 */
export const OBSTACLES: AABB[] = [
  { minX: -9, maxX: -4, minZ: -9, maxZ: -4, height: 2.6 },
  { minX: 4, maxX: 9, minZ: -9, maxZ: -4, height: 2.6 },
  { minX: -9, maxX: -4, minZ: 4, maxZ: 9, height: 2.6 },
  { minX: 4, maxX: 9, minZ: 4, maxZ: 9, height: 2.6 },
  { minX: -2.5, maxX: 2.5, minZ: -2.5, maxZ: 2.5, height: 2.6 },
  { minX: -1.5, maxX: 1.5, minZ: -14, maxZ: -11, height: 1.2 },
  { minX: -1.5, maxX: 1.5, minZ: 11, maxZ: 14, height: 1.2 },
];

export const SPAWN_POINTS: Vec3[] = [
  { x: -16, y: 0, z: -16 },
  { x: 16, y: 0, z: -16 },
  { x: -16, y: 0, z: 16 },
  { x: 16, y: 0, z: 16 },
  { x: 0, y: 0, z: -17 },
  { x: 0, y: 0, z: 17 },
  { x: -17, y: 0, z: 0 },
  { x: 17, y: 0, z: 0 },
];

/** 玩家碰撞半径（米） */
export const PLAYER_RADIUS = BALANCE.arena.playerRadius;
/** 命中胶囊：脚部到头顶的线段 */
export const CAPSULE_BOTTOM_Y = BALANCE.arena.capsuleBottomY;
export const CAPSULE_TOP_Y = BALANCE.arena.capsuleTopY;
export const EYE_Y = BALANCE.arena.eyeY;
export const CHEST_Y = BALANCE.arena.chestY;
export const HEADSHOT_MIN_Y = BALANCE.arena.headshotMinY;

export const ULT_CHARGE_MAX = BALANCE.combat.ultChargeMax;
export const ULT_CHARGE_PER_DAMAGE = BALANCE.combat.ultPerDamage;
export const ULT_CHARGE_PER_KILL = BALANCE.combat.ultPerKill;
export const ULT_CHARGE_PER_SECOND = BALANCE.combat.ultPerSecond;
export const RESPAWN_MS = BALANCE.combat.respawnMs;

export interface PlayerConfig {
  id: string;
  name: string;
  isBot?: boolean;
}

export const AI_STYLES = ['combat', 'movement'] as const;
export type AIStyle = (typeof AI_STYLES)[number];

export interface EngineOptions {
  mode?: GameModeKind;
  /** 自由混战=个人击杀线；团队死斗=队伍击杀线 */
  scoreLimit?: number;
  /** 对局最长时长（毫秒），到时按分数判定 */
  matchTimeMs?: number;
  /** 英雄选择阶段最长时长（毫秒），到时自动补选 */
  heroSelectMs?: number;
  /**
   * bot 行为风格：
   * - combat：实战 AI（索敌/射击/技能）
   * - movement：移动测试 AI（只走位不攻击，用于验证手感/碰撞）
   */
  aiStyle?: AIStyle;
  /** 可注入随机数（测试/回放用） */
  rng?: () => number;
}

export const DEFAULT_OPTIONS = {
  mode: 'ffa',
  scoreLimit: BALANCE.combat.scoreLimitDefault,
  matchTimeMs: BALANCE.combat.matchTimeMsDefault,
  heroSelectMs: BALANCE.combat.heroSelectMsDefault,
} as const;

// ---------------- 输入动作（客户端 → 引擎，全部白名单校验） ----------------

export type RealtimeInputAction =
  | { type: 'selectHero'; hero: HeroId }
  | { type: 'move'; x: number; z: number }
  | { type: 'look'; yaw: number; pitch: number }
  | { type: 'jump'; pressed: boolean }
  | { type: 'fire'; pressed: boolean }
  | { type: 'ads'; pressed: boolean }
  | { type: 'reload' }
  | { type: 'switchWeapon'; weapon: WeaponId }
  | { type: 'skill' }
  | { type: 'ult' }
  | { type: 'spawn' };

export const INPUT_TYPES = new Set<string>([
  'selectHero',
  'move',
  'look',
  'jump',
  'fire',
  'ads',
  'reload',
  'switchWeapon',
  'skill',
  'ult',
  'spawn',
]);

// ---------------- 快照（服务端 → 客户端，按玩家视角投影） ----------------

export type EffectKind =
  | 'fireTrail'
  | 'healZone'
  | 'stormZone'
  | 'bomb'
  | 'explosion'
  | 'shieldAura';

export type EventKind =
  | 'info'
  | 'shot'
  | 'hit'
  | 'heal'
  | 'skill'
  | 'ult'
  | 'kill'
  | 'respawn'
  | 'gameOver';

export interface SnapshotPlayer {
  id: string;
  name: string;
  isBot: boolean;
  team: TeamId;
  hero: HeroId | null;
  maxHp: number;
  hp: number;
  shield: number;
  alive: boolean;
  pos: Vec3;
  yaw: number;
  pitch: number;
  weapon: WeaponId;
  ammo: number;
  reserve: number;
  reloading: boolean;
  reloadT: number;
  /** 距离下一次可射击（秒） */
  fireCd: number;
  /** 主动技能剩余冷却（秒）；0=就绪 */
  skillCd: number;
  /** 终极技能充能 0-100 */
  ultCharge: number;
  ads: boolean;
  /** 隐身剩余（秒）；对不可见玩家恒为 0 */
  stealthT: number;
  /** 堡垒模式剩余（秒） */
  fortifyT: number;
  onGround: boolean;
  /** 死亡后距离重生（秒）；存活=0 */
  respawnIn: number;
  kills: number;
  deaths: number;
  score: number;
  /** 该玩家是否对当前视图者可见（隐身投影） */
  visible: boolean;
  /** 服务端已确认的该玩家最后输入序号（仅本人快照有意义，用于客户端回滚） */
  lastInputSeq: number;
}

export interface SnapshotEffect {
  id: number;
  kind: EffectKind;
  pos: Vec3;
  radius: number;
  /** 剩余时间（秒）；-1 表示瞬时特效 */
  t: number;
  duration: number;
  ownerId: string;
}

export interface SnapshotEvent {
  seq: number;
  kind: EventKind;
  text: string;
  at: number;
  pos?: Vec3;
  shooterId?: string;
  targetId?: string;
  amount?: number;
}

export interface Snapshot {
  seq: number;
  /** 引擎时钟（毫秒） */
  t: number;
  phase: 'heroSelect' | 'playing' | 'gameOver';
  youId: string;
  mode: GameModeKind;
  scoreLimit: number;
  timeLeft: number;
  heroSelectLeft: number;
  players: SnapshotPlayer[];
  effects: SnapshotEffect[];
  /** 仅包含与本玩家相关的私有事件 + 全部公开事件（增量下发） */
  events: SnapshotEvent[];
  winnerId: string | null;
  winnerTeam: TeamId | null;
  teamScores: Record<TeamId, number>;
  arena: { half: number; obstacles: AABB[] };
}

// ---------------- 纯几何工具（引擎与 AI 共用） ----------------

/** 二维线段是否被掩体/围墙阻挡（用于视线判断） */
export function segmentBlocked(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  obstacles: AABB[] = OBSTACLES,
  half: number = ARENA_HALF,
): boolean {
  // 先判断是否越墙（两端都合法时直线不会越墙）
  const walls: AABB[] = [
    { minX: half, maxX: half + 4, minZ: -half - 4, maxZ: half + 4, height: WALL_HEIGHT },
    { minX: -half - 4, maxX: -half, minZ: -half - 4, maxZ: half + 4, height: WALL_HEIGHT },
    { minX: -half - 4, maxX: half + 4, minZ: half, maxZ: half + 4, height: WALL_HEIGHT },
    { minX: -half - 4, maxX: half + 4, minZ: -half - 4, maxZ: -half, height: WALL_HEIGHT },
  ];
  const boxes = [...obstacles, ...walls];
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return false;
  for (const b of boxes) {
    const t = rayAabbXZ(ax, az, dx / len, dz / len, b);
    if (t >= 0 && t <= len) return true;
  }
  return false;
}

/**
 * 2D 射线与 AABB（XZ 平面）求交。
 * 返回命中参数 t（射线方向未归一化时按方向向量长度计），未命中返回 Infinity。
 */
export function rayAabbXZ(
  ox: number,
  oz: number,
  dirX: number,
  dirZ: number,
  b: AABB,
): number {
  let tMin = 0;
  let tMax = Infinity;
  if (Math.abs(dirX) < 1e-9) {
    if (ox < b.minX || ox > b.maxX) return Infinity;
  } else {
    let t1 = (b.minX - ox) / dirX;
    let t2 = (b.maxX - ox) / dirX;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }
  if (Math.abs(dirZ) < 1e-9) {
    if (oz < b.minZ || oz > b.maxZ) return Infinity;
  } else {
    let t1 = (b.minZ - oz) / dirZ;
    let t2 = (b.maxZ - oz) / dirZ;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }
  return tMin <= tMax ? tMin : Infinity;
}

/** 竞技场内最近合法重生点（离敌人尽量远） */
export function pickSpawn(
  rng: () => number,
  enemies: Vec3[],
  taken: Vec3[] = [],
): Vec3 {
  let best = SPAWN_POINTS[0];
  let bestScore = -Infinity;
  for (const p of SPAWN_POINTS) {
    const tooClose = taken.some(
      (t) => Math.hypot(t.x - p.x, t.z - p.z) < 1.5,
    );
    if (tooClose) continue;
    let score = rng();
    for (const e of enemies) {
      score += Math.min(Math.hypot(e.x - p.x, e.z - p.z), 30) / 30;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { ...p };
    }
  }
  return best;
}

/** 把数字安全钳制到 [min,max]，NaN/Infinity 返回 null */
export function clampNum(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, v));
}

/** 把角度折到 [-π, π) */
export function wrapAngle(a: number): number {
  let x = a;
  while (x >= Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * 把「视角相对移动」换算为世界系移动向量。
 *
 * 引擎/渲染的视角约定：yaw=0 时朝 +z；Three.js 相机经 yaw+π 补偿后，
 * 其右向量为 (-cos yaw, 0, sin yaw)。本函数是客户端唯一的方向换算出口，
 * 保证 W=画面前方、D=画面右方（与相机渲染完全一致）。
 */
export function viewRelativeMove(
  yaw: number,
  mx: number,
  mz: number,
): { x: number; z: number } {
  const fw = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
  let x = fw.x * mz + right.x * mx;
  let z = fw.z * mz + right.z * mx;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return { x, z };
}
