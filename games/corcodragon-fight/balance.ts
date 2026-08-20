/**
 * 《鳄龙咆哮》手感/玩法数值配置层（gameplay.json 的唯一入口）。
 *
 * - BALANCE：运行时唯一配置对象（可被 tweakpane 调试面板热更新）；
 * - validateBalance：加载/合并后全量 schema 校验，错误直接抛异常（fail fast）；
 * - applyBalancePatch：深合并 + 校验，任何一步失败都保持原配置不变；
 * - resetBalance：恢复 gameplay.json 出厂值。
 */
import rawBalance from './gameplay.json';

// ---------------- 类型（与 gameplay.json 一一对应） ----------------

export interface TickBalance {
  stepMs: number;
  maxAccumulatedMs: number;
  botThinkMs: number;
  effectChunkMs: number;
}

export interface ArenaBalance {
  half: number;
  wallHeight: number;
  playerRadius: number;
  eyeY: number;
  chestY: number;
  capsuleBottomY: number;
  capsuleTopY: number;
  headshotMinY: number;
  pitchClamp: number;
}

export interface MovementBalance {
  gravity: number;
  jumpVelocity: number;
  adsSpeedMult: number;
}

export interface CombatBalance {
  ultChargeMax: number;
  ultPerDamage: number;
  ultPerKill: number;
  ultPerSecond: number;
  respawnMs: number;
  /** 重生后无敌时间（毫秒） */
  respawnInvulnMs: number;
  explosionFalloff: number;
  scoreLimitDefault: number;
  matchTimeMsDefault: number;
  heroSelectMsDefault: number;
}

export interface HeroAbilityBalance {
  dashDistance?: number;
  trailRadius?: number;
  trailDuration?: number;
  trailDps?: number;
  ultRadius?: number;
  ultDamage?: number;
  stealthDuration?: number;
  stealthSpeedMult?: number;
  markRange?: number;
  markDelay?: number;
  markDamage?: number;
  shieldValue?: number;
  shieldDuration?: number;
  shieldDistance?: number;
  shieldWidth?: number;
  shieldHeight?: number;
  shieldCenterY?: number;
  fortifyDuration?: number;
  fortifyDamageMult?: number;
  fortifyFireRateMult?: number;
  selfHeal?: number;
  allyHeal?: number;
  waveRange?: number;
  waveAngleDeg?: number;
  zoneRadius?: number;
  zoneDuration?: number;
  zoneHealPerSec?: number;
  bombThrowRange?: number;
  bombSpeed?: number;
  bombGravity?: number;
  bombFuse?: number;
  bombRadius?: number;
  bombDamage?: number;
  stormRange?: number;
  stormRadius?: number;
  stormDuration?: number;
  stormDps?: number;
  slowDuration?: number;
  slowMult?: number;
}

export interface HeroBalance {
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
  ability: HeroAbilityBalance;
}

export interface WeaponBalance {
  name: string;
  emoji: string;
  damage: number;
  interval: number;
  /** -1 = 无限弹匣 */
  magSize: number;
  /** -1 = 无限备弹 */
  reserve: number;
  reloadMs: number;
  range: number;
  /** 开镜视角 FOV（度） */
  adsFov: number;
  /** 单发视角上跳（弧度，客户端后坐表现） */
  recoil: number;
  /** 每发增加的散布膨胀（弧度） */
  bloomPerShot: number;
  /** 散布膨胀上限（弧度） */
  bloomMax: number;
  /** 散布恢复速度（弧度/秒） */
  bloomRecoveryPerSec: number;
  spread: number;
  adsSpread: number;
  headshot: number;
  falloffStart: number;
  falloffEnd: number;
  minDmgMult: number;
  melee?: boolean;
  desc: string;
}

export type AILevelKey = 'easy' | 'normal' | 'hard';

export interface AILevelBalance {
  /** bot 决策周期（毫秒） */
  thinkMs: number;
  /** 允许开火的视角误差（弧度） */
  aimTolerance: number;
  /** 满足条件时实际开火概率（0-1） */
  fireChance: number;
}

export interface AIBalance {
  preferredRange: number;
  meleeRange: number;
  aimTolerance: number;
  meleeAimTolerance: number;
  /** AI 难度分级：easy/normal/hard */
  levels: Record<AILevelKey, AILevelBalance>;
}

export interface ClientBalance {
  mouseSensitivity: number;
  interpolationRate: number;
  correctionRate: number;
  softCorrectionThreshold: number;
  maxDeltaMs: number;
  maxPixelRatio: number;
  shadows: boolean;
  antialias: boolean;
  autoQuality: boolean;
  /** 远端玩家渲染缓冲（毫秒）：20Hz 快照的平滑补偿 */
  interpolationBufferMs: number;
}

export interface BalanceData {
  tick: TickBalance;
  arena: ArenaBalance;
  movement: MovementBalance;
  combat: CombatBalance;
  heroes: Record<string, HeroBalance>;
  weapons: Record<string, WeaponBalance>;
  ai: AIBalance;
  client: ClientBalance;
}

// ---------------- 校验工具 ----------------

const HERO_KEYS = [
  'yanren',
  'yingxiao',
  'tiebi',
  'lingyin',
  'guilei',
] as const;
const WEAPON_KEYS = ['rifle', 'sniper', 'pistol', 'dagger'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(path: string, msg: string): never {
  throw new Error(`gameplay.json 校验失败：${path} ${msg}`);
}

function str(v: unknown, path: string, maxLen = 200): string {
  if (typeof v !== 'string' || !v.trim()) fail(path, '必须为非空字符串');
  return v.slice(0, maxLen);
}

function num(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '必须为有限数值');
  if (v < min || v > max) fail(path, `必须在 [${min}, ${max}] 内（实际 ${v}）`);
  return v;
}

function numOrSentinel(v: unknown, path: string): number {
  if (v === -1) return -1;
  return num(v, path, 0, 1_000_000);
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, '必须为布尔值');
  return v;
}

function abilityOf(hero: string, obj: Record<string, unknown>): HeroAbilityBalance {
  const a = obj.ability;
  if (!isRecord(a)) fail(`heroes.${hero}.ability`, '必须为对象');
  const out: HeroAbilityBalance = {};
  const keys: Record<HeroAbilityBalanceKey, [number, number]> = {
    dashDistance: [1, 40],
    trailRadius: [0.1, 10],
    trailDuration: [0.1, 30],
    trailDps: [0, 500],
    ultRadius: [0.5, 40],
    ultDamage: [0, 500],
    stealthDuration: [0.1, 30],
    stealthSpeedMult: [0.5, 3],
    markRange: [1, 50],
    markDelay: [0.1, 30],
    markDamage: [0, 500],
    shieldValue: [0, 1000],
    shieldDuration: [0.1, 30],
    shieldDistance: [0.2, 10],
    shieldWidth: [0.5, 30],
    shieldHeight: [0.5, 10],
    shieldCenterY: [0.1, 4],
    fortifyDuration: [0.1, 60],
    fortifyDamageMult: [0, 1],
    fortifyFireRateMult: [0.2, 3],
    selfHeal: [0, 500],
    allyHeal: [0, 500],
    waveRange: [0.5, 60],
    waveAngleDeg: [1, 360],
    zoneRadius: [0.5, 40],
    zoneDuration: [0.1, 60],
    zoneHealPerSec: [0, 500],
    bombThrowRange: [1, 60],
    bombSpeed: [1, 60],
    bombGravity: [0, 100],
    bombFuse: [0.1, 30],
    bombRadius: [0.5, 30],
    bombDamage: [0, 500],
    stormRange: [1, 60],
    stormRadius: [0.5, 40],
    stormDuration: [0.1, 60],
    stormDps: [0, 500],
    slowDuration: [0, 10],
    slowMult: [0, 1],
  } as const;
  type HeroAbilityBalanceKey = keyof HeroAbilityBalance;
  for (const [k, range] of Object.entries(keys)) {
    const key = k as HeroAbilityBalanceKey;
    if (key in a) {
      const n = num(a[key], `heroes.${hero}.ability.${k}`, range[0], range[1]);
      (out as Record<string, number>)[key] = n;
    }
  }
  return out;
}

// ---------------- 全量校验 ----------------

export function validateBalance(data: unknown): BalanceData {
  if (!isRecord(data)) fail('', '根节点必须为对象');

  const tick = data.tick;
  if (!isRecord(tick)) fail('tick', '必须为对象');
  const arena = data.arena;
  if (!isRecord(arena)) fail('arena', '必须为对象');
  const movement = data.movement;
  if (!isRecord(movement)) fail('movement', '必须为对象');
  const combat = data.combat;
  if (!isRecord(combat)) fail('combat', '必须为对象');
  const heroes = data.heroes;
  if (!isRecord(heroes)) fail('heroes', '必须为对象');
  const weapons = data.weapons;
  if (!isRecord(weapons)) fail('weapons', '必须为对象');
  const ai = data.ai;
  if (!isRecord(ai)) fail('ai', '必须为对象');
  const client = data.client;
  if (!isRecord(client)) fail('client', '必须为对象');

  const result: BalanceData = {
    tick: {
      stepMs: num(tick.stepMs, 'tick.stepMs', 10, 200),
      maxAccumulatedMs: num(tick.maxAccumulatedMs, 'tick.maxAccumulatedMs', 50, 1000),
      botThinkMs: num(tick.botThinkMs, 'tick.botThinkMs', 20, 2000),
      effectChunkMs: num(tick.effectChunkMs, 'tick.effectChunkMs', 20, 2000),
    },
    arena: {
      half: num(arena.half, 'arena.half', 8, 200),
      wallHeight: num(arena.wallHeight, 'arena.wallHeight', 1, 20),
      playerRadius: num(arena.playerRadius, 'arena.playerRadius', 0.1, 5),
      eyeY: num(arena.eyeY, 'arena.eyeY', 0.5, 5),
      chestY: num(arena.chestY, 'arena.chestY', 0.2, 5),
      capsuleBottomY: num(arena.capsuleBottomY, 'arena.capsuleBottomY', 0, 2),
      capsuleTopY: num(arena.capsuleTopY, 'arena.capsuleTopY', 0.5, 6),
      headshotMinY: num(arena.headshotMinY, 'arena.headshotMinY', 0.5, 6),
      pitchClamp: num(arena.pitchClamp, 'arena.pitchClamp', 0.1, 1.55),
    },
    movement: {
      gravity: num(movement.gravity, 'movement.gravity', 0, 100),
      jumpVelocity: num(movement.jumpVelocity, 'movement.jumpVelocity', 0, 50),
      adsSpeedMult: num(movement.adsSpeedMult, 'movement.adsSpeedMult', 0, 1),
    },
    combat: {
      ultChargeMax: num(combat.ultChargeMax, 'combat.ultChargeMax', 1, 1000),
      ultPerDamage: num(combat.ultPerDamage, 'combat.ultPerDamage', 0, 10),
      ultPerKill: num(combat.ultPerKill, 'combat.ultPerKill', 0, 500),
      ultPerSecond: num(combat.ultPerSecond, 'combat.ultPerSecond', 0, 100),
      respawnMs: num(combat.respawnMs, 'combat.respawnMs', 0, 120_000),
      respawnInvulnMs: num(combat.respawnInvulnMs, 'combat.respawnInvulnMs', 0, 30_000),
      explosionFalloff: num(combat.explosionFalloff, 'combat.explosionFalloff', 0, 1),
      scoreLimitDefault: num(combat.scoreLimitDefault, 'combat.scoreLimitDefault', 1, 200),
      matchTimeMsDefault: num(combat.matchTimeMsDefault, 'combat.matchTimeMsDefault', 30_000, 3_600_000),
      heroSelectMsDefault: num(combat.heroSelectMsDefault, 'combat.heroSelectMsDefault', 5_000, 120_000),
    },
    heroes: {} as Record<string, HeroBalance>,
    weapons: {} as Record<string, WeaponBalance>,
    ai: {
      preferredRange: num(ai.preferredRange, 'ai.preferredRange', 0, 50),
      meleeRange: num(ai.meleeRange, 'ai.meleeRange', 0, 10),
      aimTolerance: num(ai.aimTolerance, 'ai.aimTolerance', 0.001, 1),
      meleeAimTolerance: num(ai.meleeAimTolerance, 'ai.meleeAimTolerance', 0.001, 2),
      levels: (() => {
        const rawLevels = ai.levels;
        if (!isRecord(rawLevels)) fail('ai.levels', '必须为对象');
        const out = {} as Record<AILevelKey, AILevelBalance>;
        for (const key of ['easy', 'normal', 'hard'] as const) {
          const lv = rawLevels[key];
          if (!isRecord(lv)) fail(`ai.levels.${key}`, '必须为对象');
          out[key] = {
            thinkMs: num(lv.thinkMs, `ai.levels.${key}.thinkMs`, 20, 5000),
            aimTolerance: num(lv.aimTolerance, `ai.levels.${key}.aimTolerance`, 0.001, 1.5),
            fireChance: num(lv.fireChance, `ai.levels.${key}.fireChance`, 0, 1),
          };
        }
        return out;
      })(),
    },
    client: {
      mouseSensitivity: num(client.mouseSensitivity, 'client.mouseSensitivity', 0.0001, 0.1),
      interpolationRate: num(client.interpolationRate, 'client.interpolationRate', 0, 60),
      correctionRate: num(client.correctionRate, 'client.correctionRate', 0, 60),
      softCorrectionThreshold: num(client.softCorrectionThreshold, 'client.softCorrectionThreshold', 0, 20),
      maxDeltaMs: num(client.maxDeltaMs, 'client.maxDeltaMs', 10, 250),
      maxPixelRatio: num(client.maxPixelRatio, 'client.maxPixelRatio', 0.5, 3),
      shadows: bool(client.shadows, 'client.shadows'),
      antialias: bool(client.antialias, 'client.antialias'),
      autoQuality: bool(client.autoQuality, 'client.autoQuality'),
      interpolationBufferMs: num(client.interpolationBufferMs, 'client.interpolationBufferMs', 0, 300),
    },
  };

  for (const key of HERO_KEYS) {
    const h = heroes[key];
    if (!isRecord(h)) fail(`heroes.${key}`, '必须为对象');
    result.heroes[key] = {
      name: str(h.name, `heroes.${key}.name`),
      emoji: str(h.emoji, `heroes.${key}.emoji`, 8),
      role: str(h.role, `heroes.${key}.role`),
      hp: num(h.hp, `heroes.${key}.hp`, 1, 1000),
      speed: num(h.speed, `heroes.${key}.speed`, 0.1, 50),
      skillName: str(h.skillName, `heroes.${key}.skillName`),
      skillDesc: str(h.skillDesc, `heroes.${key}.skillDesc`, 500),
      skillCd: num(h.skillCd, `heroes.${key}.skillCd`, 0, 120),
      ultName: str(h.ultName, `heroes.${key}.ultName`),
      ultDesc: str(h.ultDesc, `heroes.${key}.ultDesc`, 500),
      ability: abilityOf(key, h),
    };
  }

  for (const key of WEAPON_KEYS) {
    const w = weapons[key];
    if (!isRecord(w)) fail(`weapons.${key}`, '必须为对象');
    result.weapons[key] = {
      name: str(w.name, `weapons.${key}.name`),
      emoji: str(w.emoji, `weapons.${key}.emoji`, 8),
      damage: num(w.damage, `weapons.${key}.damage`, 0, 1000),
      interval: num(w.interval, `weapons.${key}.interval`, 10, 10_000),
      magSize: numOrSentinel(w.magSize, `weapons.${key}.magSize`),
      reserve: numOrSentinel(w.reserve, `weapons.${key}.reserve`),
      reloadMs: num(w.reloadMs, `weapons.${key}.reloadMs`, 0, 30_000),
      range: num(w.range, `weapons.${key}.range`, 0.1, 300),
      adsFov: num(w.adsFov, `weapons.${key}.adsFov`, 10, 120),
      recoil: num(w.recoil, `weapons.${key}.recoil`, 0, 0.2),
      bloomPerShot: num(w.bloomPerShot, `weapons.${key}.bloomPerShot`, 0, 0.2),
      bloomMax: num(w.bloomMax, `weapons.${key}.bloomMax`, 0, 0.5),
      bloomRecoveryPerSec: num(w.bloomRecoveryPerSec, `weapons.${key}.bloomRecoveryPerSec`, 0, 2),
      spread: num(w.spread, `weapons.${key}.spread`, 0, 0.5),
      adsSpread: num(w.adsSpread, `weapons.${key}.adsSpread`, 0, 0.5),
      headshot: num(w.headshot, `weapons.${key}.headshot`, 0.1, 10),
      falloffStart: num(w.falloffStart, `weapons.${key}.falloffStart`, 0, 500),
      falloffEnd: num(w.falloffEnd, `weapons.${key}.falloffEnd`, 0.1, 500),
      minDmgMult: num(w.minDmgMult, `weapons.${key}.minDmgMult`, 0, 1),
      melee: w.melee === undefined ? undefined : bool(w.melee, `weapons.${key}.melee`),
      desc: str(w.desc, `weapons.${key}.desc`, 500),
    };
  }

  return result;
}

/** 读取指定英雄技能数值（gameplay.json 未配置的键返回 fallback，引擎安全默认） */
export function abilityNum(
  heroId: string,
  key: keyof HeroAbilityBalance,
  fallback: number,
): number {
  const v = BALANCE.heroes[heroId]?.ability[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// ---------------- 运行时实例与热更新 ----------------

export const BALANCE: BalanceData = validateBalance(rawBalance as unknown);

function deepMerge(target: unknown, patch: unknown): unknown {
  if (isRecord(target) && isRecord(patch)) {
    const out: Record<string, unknown> = { ...target };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = v !== undefined ? deepMerge(out[k], v) : out[k];
    }
    return out;
  }
  return patch;
}

/**
 * 热更新配置（tweakpane 调试面板使用）。
 * 先深合并再做全量校验；任何字段非法都会整体拒绝，保证 BALANCE 永远可用。
 */
export function applyBalancePatch(patch: unknown): { ok: boolean; error?: string } {
  if (!isRecord(patch)) return { ok: false, error: '补丁必须为对象' };
  try {
    const next = validateBalance(deepMerge(BALANCE, patch));
    // 校验通过后原地替换，避免把引用替换掉导致 defs 里的 getter 失效
    for (const key of Object.keys(BALANCE) as (keyof BalanceData)[]) {
      (BALANCE as unknown as Record<string, unknown>)[key] = next[key];
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 恢复 gameplay.json 出厂值 */
export function resetBalance(): void {
  const next = validateBalance(rawBalance as unknown);
  for (const key of Object.keys(BALANCE) as (keyof BalanceData)[]) {
    (BALANCE as unknown as Record<string, unknown>)[key] = next[key];
  }
}

/** 当前配置的 JSON 文本（调试面板导出用） */
export function balanceToJson(pretty = true): string {
  return JSON.stringify(BALANCE, null, pretty ? 2 : 0);
}
