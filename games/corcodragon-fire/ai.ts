/**
 * 《鳄龙战场》AI 决策：只用 getView(playerId) 视角信息。
 * 策略：选英雄 → 装弹/切枪 → 能打就打 → 走位接近敌人 → 放技能/终极 → 结束回合。
 */
import {
  HERO_IDS,
  WEAPON_DEFS,
  WEAPON_IDS,
  chebyshev,
  hasClearLine,
  isInside,
  isObstacle,
  type CorcodragonAction,
  type CorcodragonView,
  type Vec,
  type WeaponId,
} from './engine';

export function chooseAiAction(view: CorcodragonView): CorcodragonAction {
  try {
    if (view.phase === 'heroSelect') {
      const hero = view.availableHeroes[0] ?? HERO_IDS[0];
      return { type: 'selectHero', hero };
    }
    if (view.phase !== 'playing' || !view.isYourTurn) {
      return { type: 'endTurn' };
    }

    const you = view.you;
    const enemies = view.players.filter((p) => {
      if (p.id === you.id || !p.visible || !p.position || p.hp == null || p.hp <= 0) return false;
      if (view.mode === 'tdm' && p.team === you.team) return false;
      return true;
    });

    if (you.ultReady) {
      const ultAction = chooseUlt(view, enemies);
      if (ultAction) return ultAction;
    }

    if (you.skillReady) {
      const skillAction = chooseSkill(view, enemies);
      if (skillAction) return skillAction;
    }

    if (you.mag <= 0 && you.weapon !== 'dagger') {
      const reserve = you.weapons[you.weapon].reserve;
      if (reserve > 0) return { type: 'reload' };
      const alt = WEAPON_IDS.find(
        (w) => w !== you.weapon && w !== 'dagger' && you.weapons[w].mag > 0,
      );
      if (alt) return { type: 'switchWeapon', weapon: alt };
    }

    const bestWeapon = chooseWeapon(view, enemies);
    if (bestWeapon && bestWeapon !== you.weapon) {
      return { type: 'switchWeapon', weapon: bestWeapon };
    }

    const shootTarget = nearestInRange(view, enemies, you.weapon);
    if (shootTarget) {
      return { type: 'shoot', targetId: shootTarget.id };
    }

    const moveAction = chooseMove(view, enemies);
    if (moveAction) return moveAction;

    return { type: 'endTurn' };
  } catch {
    return { type: 'endTurn' };
  }
}

function chooseUlt(
  view: CorcodragonView,
  enemies: CorcodragonView['players'],
): CorcodragonAction | null {
  const you = view.you;
  switch (you.hero) {
    case 'yanren': {
      if (enemies.some((e) => chebyshev(e.position!, you.position) <= 2)) {
        return { type: 'ult' };
      }
      return null;
    }
    case 'yingxiao': {
      const target = nearestInRange(view, enemies, 'sniper');
      if (target) return { type: 'ult', targetId: target.id };
      return null;
    }
    case 'tiebi': {
      if (
        you.hp < you.maxHp * 0.7 ||
        enemies.some((e) => chebyshev(e.position!, you.position) <= 6)
      ) {
        return { type: 'ult' };
      }
      return null;
    }
    case 'lingyin': {
      if (you.hp < you.maxHp * 0.75) {
        return { type: 'ult' };
      }
      return null;
    }
    case 'guilei': {
      const target = enemies[0];
      if (target) {
        return { type: 'ult', to: target.position! };
      }
      return null;
    }
    default:
      return null;
  }
}

function chooseSkill(
  view: CorcodragonView,
  enemies: CorcodragonView['players'],
): CorcodragonAction | null {
  const you = view.you;
  switch (you.hero) {
    case 'yanren': {
      const target = enemies.find((e) => chebyshev(e.position!, you.position) <= 4);
      if (!target) return null;
      const cell = nearestDashCell(view, you.position, target.position!);
      if (cell) return { type: 'skill', to: cell };
      return null;
    }
    case 'yingxiao': {
      if (enemies.length > 0) {
        return { type: 'skill' };
      }
      return null;
    }
    case 'tiebi': {
      if (
        you.hp < you.maxHp * 0.75 ||
        (you.shieldHp <= 0 && enemies.some((e) => chebyshev(e.position!, you.position) <= 7))
      ) {
        return { type: 'skill' };
      }
      return null;
    }
    case 'lingyin': {
      if (you.hp < you.maxHp * 0.8) {
        return { type: 'skill' };
      }
      return null;
    }
    case 'guilei': {
      const target = enemies.find((e) => chebyshev(e.position!, you.position) <= 6);
      if (target) return { type: 'skill', targetId: target.id };
      return null;
    }
    default:
      return null;
  }
}

function chooseWeapon(
  view: CorcodragonView,
  enemies: CorcodragonView['players'],
): WeaponId | null {
  const you = view.you;
  let best: WeaponId | null = null;
  let bestScore = -Infinity;
  for (const w of WEAPON_IDS) {
    const slot = you.weapons[w];
    if (w !== 'dagger' && slot.mag <= 0) continue;
    const def = WEAPON_DEFS[w];
    const targets = enemies.filter((e) => {
      const dist = chebyshev(e.position!, you.position);
      const range = def.range + (w !== 'dagger' && you.fortressTurns > 0 ? 2 : 0);
      return dist <= range && hasClearLine(you.position, e.position!);
    });
    if (targets.length === 0) continue;
    const score = def.damage;
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  return best;
}

function nearestInRange(
  view: CorcodragonView,
  enemies: CorcodragonView['players'],
  weapon: WeaponId,
): CorcodragonView['players'][number] | null {
  const you = view.you;
  const def = WEAPON_DEFS[weapon];
  const range = def.range + (weapon !== 'dagger' && you.fortressTurns > 0 ? 2 : 0);
  let best: CorcodragonView['players'][number] | null = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    const dist = chebyshev(e.position!, you.position);
    if (dist > range) continue;
    if (!hasClearLine(you.position, e.position!)) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

/** 炎刃冲刺：朝目标方向找一个合法直线落点 */
function nearestDashCell(view: CorcodragonView, from: Vec, to: Vec): Vec | null {
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
  const targetDir = Math.sign(to.x - from.x) || 0;
  const targetDirY = Math.sign(to.y - from.y) || 0;
  let best: Vec | null = null;
  let bestDist = Infinity;
  for (const dir of dirs) {
    if (dir.x !== targetDir && dir.y !== targetDirY) continue;
    for (let dist = 1; dist <= 4; dist++) {
      const c = { x: from.x + dir.x * dist, y: from.y + dir.y * dist };
      if (!isInside(c, view.arena.size) || isObstacle(c)) break;
      if (
        view.players.some(
          (p) =>
            p.id !== view.youId &&
            p.position &&
            p.position.x === c.x &&
            p.position.y === c.y &&
            p.hp != null &&
            p.hp > 0,
        )
      ) {
        break;
      }
      const d = chebyshev(c, to);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
  }
  return best;
}

function chooseMove(
  view: CorcodragonView,
  enemies: CorcodragonView['players'],
): CorcodragonAction | null {
  const you = view.you;
  if (you.moveOptions.length === 0) return null;
  let target: Vec;
  if (enemies.length > 0) {
    target = enemies[0].position!;
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = chebyshev(e.position!, you.position);
      if (d < bestDist) {
        bestDist = d;
        target = e.position!;
      }
    }
  } else {
    target = { x: Math.floor(view.arena.size / 2), y: Math.floor(view.arena.size / 2) };
  }
  let best: Vec = you.moveOptions[0];
  let bestDist = Infinity;
  for (const c of you.moveOptions) {
    const d = chebyshev(c, target);
    const adjacentEnemy = enemies.some((e) => chebyshev(c, e.position!) <= 1);
    const score = d + (adjacentEnemy ? 2 : 0);
    if (score < bestDist) {
      bestDist = score;
      best = c;
    }
  }
  return { type: 'move', to: best };
}
