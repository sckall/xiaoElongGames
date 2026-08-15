import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE, applyBalancePatch, balanceToJson, resetBalance, validateBalance } from '../balance';
import { HERO_DEFS, WEAPON_DEFS } from '../defs';
import { CorcodragonFightEngine } from '../engine';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => {
  resetBalance();
});

describe('gameplay.json 配置层', () => {
  it('默认配置可加载且 JSON 可导出', () => {
    expect(BALANCE.heroes.yanren.hp).toBe(150);
    expect(BALANCE.weapons.rifle.damage).toBe(20);
    const text = balanceToJson();
    expect(JSON.parse(text).tick.stepMs).toBe(50);
  });

  it('defs 代理对象随 BALANCE 热更新', () => {
    expect(HERO_DEFS.yanren.speed).toBe(5.4);
    expect(WEAPON_DEFS.pistol.reserve).toBe(Infinity);
    expect(applyBalancePatch({ heroes: { yanren: { speed: 6.6 } } })).toEqual({ ok: true });
    expect(HERO_DEFS.yanren.speed).toBe(6.6);
    expect(WEAPON_DEFS.rifle.damage).toBe(20);
  });

  it('非法补丁整体拒绝，原配置保持不变', () => {
    const before = balanceToJson();
    const r = applyBalancePatch({ movement: { gravity: -5 } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('movement.gravity');
    expect(balanceToJson()).toBe(before);
  });

  it('未知英雄/武器 id 由校验拒绝', () => {
    expect(() => validateBalance({})).toThrow();
  });

  it('resetBalance 恢复出厂值', () => {
    applyBalancePatch({ movement: { gravity: 40 }, client: { mouseSensitivity: 0.01 } });
    resetBalance();
    expect(BALANCE.movement.gravity).toBe(24);
    expect(BALANCE.client.mouseSensitivity).toBe(0.0022);
  });
});

describe('引擎实时读配置（热更新生效）', () => {
  function setup(): { e: CorcodragonFightEngine; a: string; b: string } {
    const e = new CorcodragonFightEngine(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      { mode: 'ffa', scoreLimit: 10, rng: mulberry32(5) },
    );
    for (const p of e.players) {
      if (!p.isBot) e.applyInput(p.id, { type: 'selectHero', hero: 'yanren' });
    }
    while (e.phase === 'heroSelect') e.tick(50);
    const [a, b] = [e.players[0].id, e.players[1].id];
    e.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
    return { e, a, b };
  }

  it('热更新步枪伤害后，下一枪立即按新数值结算', () => {
    const { e, a, b } = setup();
    const bp = e.player(b)!;
    e.applyInput(a, { type: 'fire', pressed: true });
    e.tick(50);
    expect(bp.hp).toBe(bp.maxHp - 20);

    applyBalancePatch({ weapons: { rifle: { damage: 55 } } });
    e.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
    e.applyInput(a, { type: 'fire', pressed: true });
    e.tick(100);
    expect(bp.hp).toBe(bp.maxHp - 20 - 55);
  });

  it('热更新重力/跳跃不影响引擎稳定性', () => {
    const { e, a } = setup();
    const p = e.player(a)!;
    applyBalancePatch({ movement: { gravity: 9.8, jumpVelocity: 12 } });
    e.applyInput(a, { type: 'jump', pressed: true });
    for (let i = 0; i < 200; i++) e.tick(50);
    expect(p.pos.y).toBe(0);
    expect(p.onGround).toBe(true);
  });
});
