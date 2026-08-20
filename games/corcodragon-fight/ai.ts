/**
 * 《鳄龙咆哮》bot 决策：只用 getSnapshot(botId) 的玩家视角信息。
 * 返回一组可交给 applyInput 的白名单动作；非法/不可用的动作由引擎安全拒绝。
 */
import { HERO_IDS, SPAWN_POINTS, segmentBlocked, wrapAngle } from './defs';
import { BALANCE } from './balance';
import type {
  AIStyle,
  AILevel,
  HeroId,
  RealtimeInputAction,
  Snapshot,
  WeaponId,
} from './defs';

export interface AIOptions {
  rng?: () => number;
  /** combat=实战；movement=只走位不攻击（手感/碰撞测试用） */
  style?: AIStyle;
  /** 难度分级：影响决策周期（引擎负责）、瞄准容差与开火概率 */
  level?: AILevel;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function chooseAIInputs(view: Snapshot, options: AIOptions = {}): RealtimeInputAction[] {
  const rng = options.rng ?? Math.random;
  const level = BALANCE.ai.levels[options.level ?? 'normal'] ?? BALANCE.ai.levels.normal;
  const me = view.players.find((p) => p.id === view.youId);
  if (!me) return [];

  if (view.phase === 'heroSelect') {
    if (!me.hero) {
      const hero = HERO_IDS[Math.min(HERO_IDS.length - 1, Math.floor(rng() * HERO_IDS.length))] as HeroId;
      return [{ type: 'selectHero', hero }];
    }
    return [];
  }
  if (view.phase === 'gameOver') return [];
  if (!me.alive) return [{ type: 'move', x: 0, z: 0 }];

  // 移动测试 AI：每隔 4 秒选一个路点走过去；不瞄准、不开火、不放技能
  if (options.style === 'movement') {
    const waypoints = [...SPAWN_POINTS, { x: 0, y: 0, z: 0 }];
    const windowIdx = Math.floor(view.t / 4000);
    const wp = waypoints[(windowIdx + hash(me.id)) % waypoints.length];
    const dx = wp.x - me.pos.x;
    const dz = wp.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    const actions: RealtimeInputAction[] = [];
    if (dist < 1.2) {
      actions.push({ type: 'move', x: 0, z: 0 });
    } else {
      actions.push({ type: 'move', x: dx / dist, z: dz / dist });
    }
    actions.push({ type: 'look', yaw: Math.atan2(dx, dz), pitch: 0 });
    if (view.t % 2400 < 200 && hash(me.id + String(Math.floor(view.t / 2400))) % 4 === 0) {
      actions.push({ type: 'jump', pressed: true });
    }
    return actions;
  }

  // 团队死斗只攻击敌方；自由混战除自己外都是敌人
  const enemies = view.players.filter(
    (p) =>
      p.alive &&
      p.visible &&
      p.id !== view.youId &&
      (view.mode === 'tdm' ? p.team !== me.team : true),
  );
  const actions: RealtimeInputAction[] = [];

  // 没有可见敌人：原地转圈巡逻
  if (enemies.length === 0) {
    const t = view.t / 1000;
    actions.push({ type: 'move', x: 0, z: 0 });
    actions.push({ type: 'look', yaw: me.yaw + t * 0.6, pitch: 0 });
    return actions;
  }

  // 最近敌人
  let target = enemies[0];
  let best = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(e.pos.x - me.pos.x, e.pos.z - me.pos.z);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  const dx = target.pos.x - me.pos.x;
  const dz = target.pos.z - me.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const desiredYaw = Math.atan2(dx, dz);
  const aimYawDiff = Math.abs(wrapAngle(desiredYaw - me.yaw));
  const canSee = !segmentBlocked(
    me.pos.x,
    me.pos.z,
    target.pos.x,
    target.pos.z,
    view.arena?.obstacles,
    view.arena?.half,
  );

  // 武器选择：近身用匕首，远处用步枪/狙击（按英雄习惯）
  const meleeRange = BALANCE.ai.meleeRange;
  const preferred: WeaponId =
    dist < meleeRange ? 'dagger' : dist > 18 && me.hero === 'yingxiao' ? 'sniper' : 'rifle';
  if (me.weapon !== preferred) {
    actions.push({ type: 'switchWeapon', weapon: preferred });
  }

  // 移动：接近/拉开 + 周期性横向拉扯，避免站桩
  const strafeSign = Math.sin(view.t / 900 + hash(me.id) % 13) > 0 ? 1 : -1;
  const preferredDist = me.weapon === 'dagger' ? 1.6 : BALANCE.ai.preferredRange;
  let mx = 0;
  let mz = 0;
  if (dist > preferredDist + 1) {
    mx = dx / dist;
    mz = dz / dist;
  } else if (dist < preferredDist * 0.5) {
    mx = -dx / dist;
    mz = -dz / dist;
  }
  // 拉扯方向（世界系，垂直于朝向）
  mx += (dz / dist) * strafeSign * 0.7;
  mz += (-dx / dist) * strafeSign * 0.7;
  const ml = Math.hypot(mx, mz) || 1;
  actions.push({ type: 'move', x: Math.max(-1, Math.min(1, mx / ml)), z: Math.max(-1, Math.min(1, mz / ml)) });

  // 视线
  const dy = CHEST - 1.62;
  const desiredPitch = Math.max(-0.5, Math.min(0.5, Math.atan2(dy, dist)));
  actions.push({ type: 'look', yaw: desiredYaw, pitch: desiredPitch });

  // 开镜（远距离）
  if (!me.weapon.includes('dagger') && dist > 15 && me.weapon !== 'pistol') {
    actions.push({ type: 'ads', pressed: true });
  } else {
    actions.push({ type: 'ads', pressed: false });
  }

  // 开火：难度决定瞄准容差与开火概率（easy 会经常“故意放水”）
  const aimOk =
    me.weapon === 'dagger'
      ? aimYawDiff < BALANCE.ai.meleeAimTolerance && dist < meleeRange
      : aimYawDiff < level.aimTolerance;
  const canFire = me.fireCd <= 0.03 && me.ammo > 0 && !me.reloading;
  if (canSee && aimOk && canFire && rng() < level.fireChance) {
    actions.push({ type: 'fire', pressed: true });
  } else {
    actions.push({ type: 'fire', pressed: false });
    if (me.weapon === 'sniper' && me.fireCd > 0.5) {
      // 狙击枪打一枪后松开扳机，避免装好弹就盲射
      actions.push({ type: 'fire', pressed: false });
    }
  }

  // 换弹
  const magSize = BALANCE.weapons[me.weapon]?.magSize;
  const lowAmmo =
    typeof magSize === 'number' && magSize > 0
      ? me.ammo <= Math.max(1, Math.floor(magSize * 0.25))
      : me.ammo <= 1;
  if (me.ammo === 0 || (lowAmmo && dist > 10)) {
    actions.push({ type: 'reload' });
  }

  // 主动技能：按英雄与局势（低难度 AI 使用技能的概率更低）
  if (me.skillCd <= 0.03 && canSee && rng() < level.fireChance) {
    switch (me.hero) {
      case 'yanren':
        if (dist < 12) actions.push({ type: 'skill' });
        break;
      case 'yingxiao':
        if (dist < 18) actions.push({ type: 'skill' });
        break;
      case 'tiebi':
        if (me.hp / me.maxHp < 0.65) actions.push({ type: 'skill' });
        break;
      case 'lingyin':
        if (me.hp / me.maxHp < 0.8) actions.push({ type: 'skill' });
        break;
      case 'guilei':
        if (dist < 22) {
          actions.push(me.skillAim ? { type: 'skillFire' } : { type: 'skill' });
        }
        break;
    }
  }

  // 终极技能
  if (me.ultCharge >= 99 && rng() < level.fireChance) {
    switch (me.hero) {
      case 'yanren':
      case 'yingxiao':
        if (dist < 15 && canSee) actions.push({ type: 'ult' });
        break;
      case 'guilei':
        // 雷暴云已改为以自身为中心：直接释放
        if (dist < 15 && canSee) actions.push({ type: 'ult' });
        break;
      case 'tiebi':
        if (dist < 20) actions.push({ type: 'ult' });
        break;
      case 'lingyin':
        if (me.hp / me.maxHp < 0.55) actions.push({ type: 'ult' });
        break;
    }
  }

  // 偶尔跳跃
  if (view.t % 2400 < 200 && hash(me.id + String(Math.floor(view.t / 2400))) % 3 === 0) {
    actions.push({ type: 'jump', pressed: true });
  }

  return actions;
}

const CHEST = 1.15;
