/**
 * 《鳄龙咆哮》bot 决策：只用 getSnapshot(botId) 的玩家视角信息。
 * 返回一组可交给 applyInput 的白名单动作；非法/不可用的动作由引擎安全拒绝。
 */
import { HERO_IDS, segmentBlocked, wrapAngle } from './defs';
import type {
  HeroId,
  RealtimeInputAction,
  Snapshot,
  WeaponId,
} from './defs';

export interface AIOptions {
  rng?: () => number;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function chooseAIInputs(view: Snapshot, options: AIOptions = {}): RealtimeInputAction[] {
  const rng = options.rng ?? Math.random;
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

  const enemies = view.players.filter((p) => p.id !== view.youId && p.alive && p.visible);
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
  const canSee = !segmentBlocked(me.pos.x, me.pos.z, target.pos.x, target.pos.z);

  // 武器选择：近身用匕首，远处用步枪/狙击（按英雄习惯）
  const preferred: WeaponId = dist < 3.4 ? 'dagger' : dist > 18 && me.hero === 'yingxiao' ? 'sniper' : 'rifle';
  if (me.weapon !== preferred) {
    actions.push({ type: 'switchWeapon', weapon: preferred });
  }

  // 移动：接近/拉开 + 周期性横向拉扯，避免站桩
  const strafeSign = Math.sin(view.t / 900 + hash(me.id) % 13) > 0 ? 1 : -1;
  const preferredDist = me.weapon === 'dagger' ? 1.6 : 9;
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

  // 开火
  const aimOk =
    me.weapon === 'dagger' ? aimYawDiff < 0.5 && dist < 2.9 : aimYawDiff < 0.12;
  const canFire = me.fireCd <= 0.03 && me.ammo > 0 && !me.reloading;
  if (canSee && aimOk && canFire) {
    actions.push({ type: 'fire', pressed: true });
  } else {
    actions.push({ type: 'fire', pressed: false });
    if (me.weapon === 'sniper' && me.fireCd > 0.5) {
      // 狙击枪打一枪后松开扳机，避免装好弹就盲射
      actions.push({ type: 'fire', pressed: false });
    }
  }

  // 换弹
  if (me.ammo === 0 || (me.ammo <= Math.max(1, Math.floor((me.weapon === 'rifle' ? 30 : me.weapon === 'sniper' ? 5 : 12) * 0.25)) && dist > 10)) {
    actions.push({ type: 'reload' });
  }

  // 主动技能：按英雄与局势
  if (me.skillCd <= 0.03 && canSee) {
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
        if (dist < 22) actions.push({ type: 'skill' });
        break;
    }
  }

  // 终极技能
  if (me.ultCharge >= 99) {
    switch (me.hero) {
      case 'yanren':
      case 'guilei':
      case 'yingxiao':
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
