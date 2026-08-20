import { describe, expect, it } from 'vitest';
import { CorcodragonFightEngine } from '../engine';
import { BALANCE } from '../balance';
import {
  HERO_IDS,
  PLAYER_RADIUS,
  viewRelativeMove,
  type EngineOptions,
  type RealtimeInputAction,
} from '../defs';

/** 可复现随机 */
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

function mkPlayers(n: number, bots = false) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `玩家${i + 1}`,
    isBot: bots,
  }));
}

function mkEngine(n = 2, opts: EngineOptions = {}): CorcodragonFightEngine {
  return new CorcodragonFightEngine(mkPlayers(n), {
    scoreLimit: 10,
    heroSelectMs: 10_000,
    matchTimeMs: 60_000,
    respawnMs: 1_000,
    tickStepMs: 50, // 固定旧步长，保持时序断言确定性
    rng: mulberry32(42),
    ...opts,
  });
}

/** 给所有真人选英雄并推进到 playing（也覆盖超时自动补选路径） */
function start(engine: CorcodragonFightEngine, hero = 'yanren'): void {
  for (const p of engine.players) {
    if (!p.isBot && !p.hero) engine.applyInput(p.id, { type: 'selectHero', hero });
  }
  let guard = 0;
  while (engine.phase === 'heroSelect' && guard++ < 500) engine.tick(50);
}

function tick(engine: CorcodragonFightEngine, ms: number): void {
  engine.tick(ms);
}

describe('构造与选项校验', () => {
  it('玩家数必须 1-8', () => {
    expect(() => new CorcodragonFightEngine([])).toThrow();
    expect(() => new CorcodragonFightEngine(mkPlayers(9))).toThrow();
  });

  it('玩家 id 不能重复', () => {
    expect(
      () =>
        new CorcodragonFightEngine([
          { id: 'a', name: 'A' },
          { id: 'a', name: 'B' },
        ]),
    ).toThrow(/重复/);
  });

  it('默认 30Hz 步长且可自定义（20/30/60Hz 选项）', () => {
    const def = new CorcodragonFightEngine(mkPlayers(2), { rng: mulberry32(5) });
    expect(def.tickStepMs).toBeCloseTo(100 / 3, 3);
    expect(new CorcodragonFightEngine(mkPlayers(2), { tickStepMs: 50, rng: mulberry32(5) }).tickStepMs).toBe(50);
    expect(new CorcodragonFightEngine(mkPlayers(2), { tickStepMs: 16.67, rng: mulberry32(5) }).tickStepMs).toBeCloseTo(16.67);
  });

  it('选项白名单钳制', () => {
    const e = new CorcodragonFightEngine(mkPlayers(2), {
      mode: 'nuke' as never,
      scoreLimit: NaN,
      tickStepMs: 50,
      matchTimeMs: Infinity,
      heroSelectMs: -5,
    });
    expect(e.mode).toBe('ffa');
    expect(e.scoreLimit).toBe(15);
    expect(e.matchTimeMs).toBe(600_000);
    expect(e.heroSelectMs).toBe(30_000);
  });
});

describe('applyInput 入参校验（白名单 + 数值域）', () => {
  it('拒绝非对象/未知动作/缺字段', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    for (const bad of [null, undefined, 1, 'x', [], { type: 'nuke' }, { type: 'move' }, { type: 'move', x: '1', z: 0 }]) {
      expect(e.applyInput(a, bad).ok).toBe(false);
    }
  });

  it('move/look 拒绝 NaN 与 Infinity，合法值被钳制', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    expect(e.applyInput(a, { type: 'move', x: NaN, z: 0 }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'move', x: 0, z: Infinity }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'look', yaw: NaN, pitch: 0 }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'look', yaw: 0, pitch: 99 }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'move', x: 9, z: -9 })).toEqual({ ok: true });
    expect(e.players[0].moveX).toBe(1);
    expect(e.players[0].moveZ).toBe(-1);
  });

  it('pressed 必须是布尔，不允许数字伪装', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    expect(e.applyInput(a, { type: 'fire', pressed: 1 }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'jump', pressed: 0 }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'ads', pressed: 'true' }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'fire', pressed: true })).toEqual({ ok: true });
  });

  it('阶段限制：heroSelect 不能移动/开火，playing 不能选英雄', () => {
    const e = mkEngine();
    const a = e.players[0].id;
    expect(e.phase).toBe('heroSelect');
    expect(e.applyInput(a, { type: 'move', x: 0, z: 1 }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'fire', pressed: true }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'selectHero', hero: 'yanren' })).toEqual({ ok: true });
    start(e);
    expect(e.applyInput(a, { type: 'selectHero', hero: 'tiebi' }).ok).toBe(false);
  });

  it('英雄/武器必须是白名单 id', () => {
    const e = mkEngine();
    const a = e.players[0].id;
    expect(e.applyInput(a, { type: 'selectHero', hero: 'hacker' }).ok).toBe(false);
    start(e);
    expect(e.applyInput(a, { type: 'switchWeapon', weapon: 'minigun' }).ok).toBe(false);
    expect(e.applyInput(a, { type: 'switchWeapon', weapon: 'dagger' })).toEqual({ ok: true });
  });

  it('未知玩家安全拒绝', () => {
    const e = mkEngine();
    start(e);
    expect(e.applyInput('ghost', { type: 'move', x: 0, z: 0 }).ok).toBe(false);
  });
});

describe('移动物理', () => {
  it('WASD 移动并受围墙碰撞限制', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    const p = e.players[0];
    // 沿 z=-5 的开放走廊横穿（新地图侧翼墙 z∈[-20,-13]，角落箱 x∈[-11,-6]），
    // 验证左右围墙限制
    e.debug.place(a, { x: -19, y: 0, z: -5 }, 0, 0);
    e.applyInput(a, { type: 'move', x: 1, z: 0 });
    for (let i = 0; i < 400; i++) tick(e, 50);
    const half = BALANCE.arena.half;
    expect(p.pos.x).toBeGreaterThan(0);
    expect(p.pos.x).toBeLessThanOrEqual(half - PLAYER_RADIUS + 1e-6);
    expect(p.pos.x).toBeGreaterThanOrEqual(-half + PLAYER_RADIUS - 1e-6);
  });

  it('掩体碰撞不穿墙', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    const p = e.players[0];
    // 朝中心掩体（z=-2.5..2.5, x=-2.5..2.5）前进
    e.debug.place(a, { x: 0, y: 0, z: -5 }, 0, 0);
    e.applyInput(a, { type: 'move', x: 0, z: 1 });
    for (let i = 0; i < 200; i++) tick(e, 50);
    expect(p.pos.z).toBeLessThanOrEqual(-2.5 - PLAYER_RADIUS + 1e-6);
  });

  it('跳跃受重力约束，最终落地', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    const p = e.players[0];
    e.applyInput(a, { type: 'jump', pressed: true });
    tick(e, 50);
    expect(p.pos.y).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) tick(e, 50);
    expect(p.pos.y).toBe(0);
    expect(p.onGround).toBe(true);
  });
});

describe('射击与伤害', () => {
  function facingPair(): { e: CorcodragonFightEngine; a: string; b: string } {
    const e = mkEngine();
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    // 放在 x=-5 的空旷走廊上（新地图角落箱 x∈[-11,-6]，这里无遮挡）
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    return { e, a, b };
  }

  it('步枪命中造成 20 伤害（rng=0.5 无散布）', () => {
    const { e, a, b } = facingPair();
    const bp = e.player(b)!;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(bp.hp).toBe(bp.maxHp - 20);
  });

  it('爆头判定（头部高度）伤害翻倍', () => {
    const { e, a, b } = facingPair();
    const bp = e.player(b)!;
    e.applyInput(a, { type: 'look', yaw: 0, pitch: 0.036 }); // 瞄向 5 米外 1.8m 高度
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(bp.hp).toBe(bp.maxHp - 40);
  });

  it('躯干/腹部命中回归：向下瞄准时胶囊柱身也必须命中（历史 bug）', () => {
    // 回归：rayCapsule 旧实现会把“柱身命中”被端点球 Infinity 覆盖，
    // 导致瞄准胸口/肚子时只有贴近头部的射线能命中，表现成“只有头能被打到”。
    const { e, a, b } = facingPair();
    const bp = e.player(b)!;
    for (const [label, pitch, expectedHp] of [
      ['胸口 1.15m', Math.atan2(-0.47, 5), bp.maxHp - 20],
      ['腹部 0.80m', Math.atan2(-0.82, 5), bp.maxHp - 20],
    ] as const) {
      bp.hp = bp.maxHp;
      e.players[0].fireCd = 0;
      const before = e.events.length;
      e.applyInput(a, { type: 'look', yaw: 0, pitch });
      e.applyInput(a, { type: 'fire', pressed: true });
      tick(e, 50);
      e.applyInput(a, { type: 'fire', pressed: false });
      const hit = e.events.slice(before).find((ev) => ev.kind === 'hit' && ev.targetId === b);
      expect(hit, label).toBeTruthy();
      expect(bp.hp, label).toBe(expectedHp);
      expect(hit?.text, label).not.toBe('爆头！');
    }
  });

  it('掩体阻挡弹道', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    const b = e.players[1].id;
    const bp = e.player(b)!;
    e.debug.place(a, { x: 0, y: 0, z: -4 }, 0, 0);
    e.debug.place(b, { x: 0, y: 0, z: 4 }, Math.PI, 0);
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(bp.hp).toBe(bp.maxHp);
  });

  it('队友伤害关闭（TDM）', () => {
    // p1/p3 同队 A，p2/p4 同队 B（座位交替分队）
    const t = new CorcodragonFightEngine(mkPlayers(4), {
      mode: 'tdm',
      scoreLimit: 10,
      tickStepMs: 50,
      rng: mulberry32(7),
    });
    for (const p of t.players) {
      if (!p.isBot) t.applyInput(p.id, { type: 'selectHero', hero: 'yanren' });
    }
    while (t.phase === 'heroSelect') t.tick(50);
    const a = t.players[0].id; // A 队
    const teammate = t.players[2].id; // A 队
    expect(t.players[0].team).toBe(t.players[2].team);
    t.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    t.debug.place(teammate, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    t.applyInput(a, { type: 'fire', pressed: true });
    t.tick(50);
    expect(t.player(teammate)!.hp).toBe(t.player(teammate)!.maxHp);
  });

  it('射击统计与散布膨胀/恢复', () => {
    const { e, a, b } = facingPair();
    const p = e.player(a)!;
    e.applyInput(a, { type: 'fire', pressed: true });
    for (let i = 0; i < 3; i++) {
      tick(e, 100);
      e.applyInput(a, { type: 'fire', pressed: true });
    }
    const me = e.getSnapshot(a).players.find((x) => x.id === a)!;
    expect(me.shots).toBeGreaterThanOrEqual(3);
    expect(me.hits).toBeGreaterThanOrEqual(3);
    expect(me.damageDealt).toBeGreaterThanOrEqual(60);
    expect(p.spreadBloom).toBeGreaterThan(0);
    e.applyInput(a, { type: 'fire', pressed: false });
    for (let i = 0; i < 120; i++) tick(e, 50);
    expect(p.spreadBloom).toBe(0);
  });

  it('弹药消耗与换弹', () => {
    const { e, a } = facingPair();
    const p = e.player(a)!;
    e.applyInput(a, { type: 'fire', pressed: true });
    // 步枪 100ms 一枪 → 64 tick 打完 30 发并触发自动换弹
    for (let i = 0; i < 64; i++) tick(e, 50);
    expect(p.ammo).toBe(0);
    expect(p.reloading).toBe(true);
    e.applyInput(a, { type: 'fire', pressed: false }); // 换弹期间停止扣扳机
    for (let i = 0; i < 40; i++) tick(e, 50);
    expect(p.reloading).toBe(false);
    expect(p.ammo).toBe(30);
    expect(p.reserve).toBe(60);
  });

  it('击杀 → 记分 → 3 秒重生；到达击杀线结束', () => {
    const e = new CorcodragonFightEngine(mkPlayers(2), {
      mode: 'ffa',
      scoreLimit: 1,
      tickStepMs: 50,
      rng: mulberry32(3),
    });
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    const ap = e.player(a)!;
    const bp = e.player(b)!;
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    bp.hp = 1;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(bp.alive).toBe(false);
    expect(ap.score).toBe(1);
    expect(e.phase).toBe('gameOver');
    expect(e.winnerId).toBe(a);
    // gameOver 后不再重生
    for (let i = 0; i < 100; i++) tick(e, 50);
    expect(bp.alive).toBe(false);
  });

  it('默认复活时长 15 秒，且可每局配置', () => {
    const def = new CorcodragonFightEngine(mkPlayers(2), { rng: mulberry32(5) });
    expect(def.respawnMs).toBe(15_000);
    const custom = new CorcodragonFightEngine(mkPlayers(2), {
      respawnMs: 5_000,
      rng: mulberry32(5),
    });
    expect(custom.respawnMs).toBe(5_000);
  });

  it('死亡期间可换英雄，复活后按新英雄满血重生', () => {
    const e = mkEngine();
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    const bp = e.player(b)!;
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    bp.hp = 1;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(bp.alive).toBe(false);
    expect(e.applyInput(b, { type: 'selectHero', hero: 'tiebi' })).toEqual({ ok: true });
    expect(bp.hero).toBe('tiebi');
    expect(bp.maxHp).toBe(250);
    expect(bp.hp).toBe(0); // 换英雄不立即复活
    for (let i = 0; i < 30; i++) tick(e, 50);
    expect(bp.alive).toBe(true);
    expect(bp.hero).toBe('tiebi');
    expect(bp.hp).toBe(250);
  });

  it('死亡 3 秒后自动重生并回满状态', () => {
    const e = mkEngine();
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    const bp = e.player(b)!;
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    bp.hp = 1;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(bp.alive).toBe(false);
    for (let i = 0; i < 70; i++) tick(e, 50);
    expect(bp.alive).toBe(true);
    expect(bp.hp).toBe(bp.maxHp);
    const snapB = e.getSnapshot(b);
    expect(snapB.players.find((p) => p.id === b)?.respawnIn).toBe(0);
  });

  it('重生后 1.5 秒无敌：期间不受伤，结束后恢复可伤害', () => {
    const e = mkEngine(); // 本测试环境复活 1s，便于验证
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    const ap = e.player(a)!;
    const bp = e.player(b)!;
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    bp.hp = 1;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    for (let i = 0; i < 25; i++) tick(e, 50); // 1.25s：已复活且无敌尚未结束
    expect(bp.alive).toBe(true);
    expect(bp.invulnT).toBeGreaterThan(0);
    // 无敌期间：打不进去
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    ap.fireCd = 0;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    e.applyInput(a, { type: 'fire', pressed: false });
    expect(bp.hp).toBe(bp.maxHp);
    // 无敌结束后：正常受伤
    for (let i = 0; i < 30; i++) tick(e, 50); // 1.5s
    expect(bp.invulnT).toBe(0);
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    ap.fireCd = 0;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    e.applyInput(a, { type: 'fire', pressed: false });
    expect(bp.hp).toBe(bp.maxHp - 20);
  });
});

describe('英雄技能与终极技', () => {
  function pair(heroA: string, heroB = 'tiebi'): { e: CorcodragonFightEngine; a: string; b: string } {
    const e = mkEngine();
    start(e, heroA);
    const [a, b] = [e.players[0].id, e.players[1].id];
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    return { e, a, b };
  }

  it('炎刃：烈焰冲刺前进并灼烧敌人', () => {
    const { e, a, b } = pair('yanren');
    const ap = e.player(a)!;
    const bp = e.player(b)!;
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    expect(ap.pos.z).toBeGreaterThan(-1);
    expect(e.player(a)!.skillCd).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) tick(e, 50);
    expect(bp.hp).toBeLessThan(bp.maxHp);
  });

  it('影枭：隐身 6 秒；首击压至 1 血、攻击后显形并充满终极技', () => {
    const { e, a, b } = pair('yingxiao');
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    const viewB = e.getSnapshot(b);
    const hidden = viewB.players.find((p) => p.id === a)!;
    expect(hidden.visible).toBe(false);
    expect(hidden.pos.y).toBe(-100);
    const viewA = e.getSnapshot(a);
    const meA = viewA.players.find((p) => p.id === a)!;
    expect(meA.stealthT).toBeGreaterThan(5.8); // 6 秒隐身
    expect(meA.stealthStrikeReady).toBe(true);
    const ap = e.player(a)!;
    const bp = e.player(b)!;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(bp.hp).toBe(1); // 首击压到 1
    expect(ap.stealthT).toBe(0); // 攻击后退出隐身
    expect(ap.ultCharge).toBeGreaterThanOrEqual(100); // 隐身命中 → 终极技充满
    expect(e.getSnapshot(b).players.find((p) => p.id === a)!.visible).toBe(true);
  });

  it('影枭：隐身期间被命中也会立即显形', () => {
    const { e, a, b } = pair('yingxiao');
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    expect(e.getSnapshot(b).players.find((p) => p.id === a)!.visible).toBe(false);
    e.applyInput(b, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(e.player(a)!.stealthT).toBe(0);
    expect(e.getSnapshot(b).players.find((p) => p.id === a)!.visible).toBe(true);
  });

  it('影枭：死亡标记击杀目标后立即刷新主动技能 CD', () => {
    const { e, a, b } = pair('yingxiao');
    const ap = e.player(a)!;
    const bp = e.player(b)!;
    ap.skillCd = 5; // 制造一个正在冷却的 Q
    e.debug.setUltCharge(a, 100);
    bp.hp = 50;
    expect(e.applyInput(a, { type: 'ult' })).toEqual({ ok: true });
    // 2.5 秒标记延迟
    for (let i = 0; i < 55; i++) tick(e, 50);
    expect(bp.alive).toBe(false);
    expect(ap.skillCd).toBe(0); // 大招击杀 → Q 刷新
  });

  it('影枭：死亡标记优先锁定视野内血量最低的敌人', () => {
    const e = new CorcodragonFightEngine(mkPlayers(3), {
      scoreLimit: 10,
      tickStepMs: 50,
      rng: mulberry32(11),
    });
    start(e, 'yingxiao');
    const [a, near, far] = [e.players[0].id, e.players[1].id, e.players[2].id];
    e.debug.place(a, { x: -5, y: 0, z: -6 }, 0, 0);
    e.debug.place(near, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    e.debug.place(far, { x: -5, y: 0, z: 6 }, Math.PI, 0);
    e.player(near)!.hp = 120; // 近的敌人满血
    e.player(far)!.hp = 30; // 远的敌人残血 → 应被标记
    e.debug.setUltCharge(a, 100);
    e.applyInput(a, { type: 'ult' });
    tick(e, 50);
    const mark = [...e.events].reverse().find((ev) => ev.kind === 'ult' && ev.shooterId === a);
    expect(mark?.targetId).toBe(far);
    for (let i = 0; i < 55; i++) tick(e, 50);
    expect(e.player(far)!.alive).toBe(false);
    expect(e.player(near)!.alive).toBe(true);
  });

  it('铁壁：视角正前方能量墙吸收敌方子弹（不再扣自身临时护盾）', () => {
    const { e, a, b } = pair('tiebi');
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    const ap = e.player(a)!;
    expect(ap.shield).toBe(300);
    // b 站在 +z 方向，面向 -z 朝 a 射击；子弹必须先穿过 a 前方 1.8m 的能量墙
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    const before = e.events.length;
    e.applyInput(b, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(ap.hp).toBe(ap.maxHp);
    expect(ap.shield).toBe(280); // 步枪 20 点伤害被护盾吸收
    expect(e.events.slice(before).some((ev) => ev.kind === 'blocked')).toBe(true);
  });

  it('铁壁：能量墙实时随视角旋转，侧后方不遮挡', () => {
    const { e, a, b } = pair('tiebi');
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    const ap = e.player(a)!;
    // a 转向 +x（yaw=π/2）：墙改挡东侧，+z 方向的 b 不再被墙拦截
    e.applyInput(a, { type: 'look', yaw: Math.PI / 2, pitch: 0 });
    e.debug.place(b, { x: -5, y: 0, z: -1 }, Math.PI, 0);
    e.applyInput(b, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(ap.hp).toBe(ap.maxHp - 20);
    expect(ap.shield).toBe(300);
  });

  it('灵音：治愈波回血', () => {
    const { e, a } = pair('lingyin');
    const ap = e.player(a)!;
    ap.hp = 50;
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    expect(ap.hp).toBe(95);
  });

  it('灵音：治愈波只治疗视角前方扇形内队友', () => {
    const e = new CorcodragonFightEngine(mkPlayers(6), {
      mode: 'tdm',
      scoreLimit: 10,
      tickStepMs: 50,
      rng: mulberry32(21),
    });
    start(e, 'lingyin');
    const a = e.players[0].id; // A 队
    const front = e.players[2].id; // A 队（放在视角前方）
    const back = e.players[4].id; // A 队（放在视角后方）
    e.debug.place(a, { x: -8, y: 0, z: 0 }, Math.PI / 2, 0); // 面朝 +x
    e.debug.place(front, { x: -3, y: 0, z: 0 }, Math.PI, 0);
    e.debug.place(back, { x: -13, y: 0, z: 0 }, 0, 0);
    e.player(front)!.hp = 50;
    e.player(back)!.hp = 50;
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    expect(e.player(front)!.hp).toBe(80); // 扇形内队友 +30
    expect(e.player(back)!.hp).toBe(50); // 身后队友不加
    const eff = e.getSnapshot(a).effects.find((x) => x.kind === 'healWave');
    expect(eff).toBeTruthy();
    expect(eff?.arc).toBeGreaterThan(0);
  });

  it('诡雷：Q 准备后左键抛出可见抛物线炸弹，落地延迟爆炸', () => {
    const { e, a, b } = pair('guilei');
    const bp = e.player(b)!;
    const ap = e.player(a)!;
    expect(e.applyInput(a, { type: 'skill' })).toEqual({ ok: true });
    tick(e, 50);
    expect(ap.skillAim).toBe(true); // 只进入准备，不消耗冷却
    expect(ap.skillCd).toBe(0);
    expect(bp.hp).toBe(bp.maxHp);
    expect(e.applyInput(a, { type: 'skillFire' })).toEqual({ ok: true });
    tick(e, 50);
    expect(ap.skillAim).toBe(false);
    expect(ap.skillCd).toBeGreaterThan(0);
    // 抛体存在并沿抛物线前进（pitch=0：初始 y 下降、z 前进）
    const bomb0 = e.getSnapshot(a).effects.find((x) => x.kind === 'bomb');
    expect(bomb0).toBeTruthy();
    const y0 = bomb0!.pos.y;
    const z0 = bomb0!.pos.z;
    for (let i = 0; i < 4; i++) tick(e, 50);
    const bomb1 = e.getSnapshot(a).effects.find((x) => x.kind === 'bomb');
    expect(bomb1).toBeTruthy();
    expect(bomb1!.pos.y).toBeLessThan(y0);
    expect(bomb1!.pos.z).toBeGreaterThan(z0);
    // 预计落地 z≈-6+8.3=2.3：把敌人放在落点附近，等引信结束被炸伤
    e.debug.place(b, { x: -5, y: 0, z: 2.3 }, Math.PI, 0);
    for (let i = 0; i < 50; i++) tick(e, 50);
    expect(bp.hp).toBeLessThan(bp.maxHp);
  });

  it('诡雷：二段瞄准可取消；雷暴云改为以自身为中心的圆形控制技', () => {
    const { e, a, b } = pair('guilei');
    const ap = e.player(a)!;
    const bp = e.player(b)!;
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    expect(e.applyInput(a, { type: 'skillCancel' })).toEqual({ ok: true });
    expect(ap.skillAim).toBe(false);
    expect(ap.skillCd).toBe(0);
    expect(e.applyInput(a, { type: 'skillFire' }).ok).toBe(false); // 未准备不能确认

    e.debug.setUltCharge(a, 100);
    expect(e.applyInput(a, { type: 'ult' })).toEqual({ ok: true });
    tick(e, 50);
    expect(ap.ultAim).toBe(false); // 不再有二段引导
    expect(ap.ultCharge).toBeLessThan(10);
    const storm = e.getSnapshot(a).effects.find((x) => x.kind === 'stormZone');
    expect(storm).toBeTruthy();
    expect(storm!.pos.x).toBeCloseTo(ap.pos.x);
    expect(storm!.pos.z).toBeCloseTo(ap.pos.z);
    // 控制为主：低伤害但减速生效
    const hpBefore = bp.hp;
    for (let i = 0; i < 6; i++) tick(e, 50);
    expect(bp.hp).toBeLessThan(hpBefore); // 每 250ms 造成 8×0.25=2 点
    expect(bp.hp).toBeGreaterThan(hpBefore - 12);
    expect(bp.slowT).toBeGreaterThan(0);
  });

  it('终极技需要 100 充能；炎刃焚天烈焰范围伤害与范围火环', () => {
    const { e, a, b } = pair('yanren');
    const bp = e.player(b)!;
    expect(e.applyInput(a, { type: 'ult' }).ok).toBe(false);
    e.debug.setUltCharge(a, 100);
    expect(e.applyInput(a, { type: 'ult' })).toEqual({ ok: true });
    tick(e, 50);
    // 5 米距离上爆炸伤害按距离衰减（80 × (1-5/12×0.5) ≈ 63）
    expect(bp.hp).toBeLessThanOrEqual(bp.maxHp - 50);
    expect(bp.hp).toBeGreaterThanOrEqual(bp.maxHp - 75);
    // 释放后立即清零；同一 tick 会自然回复 0.1 点充能
    expect(e.player(a)!.ultCharge).toBeLessThanOrEqual(0.11);
    // 清晰范围提示火环与爆炸一起下发
    const ring = e.getSnapshot(a).effects.find((x) => x.kind === 'ultRing');
    expect(ring).toBeTruthy();
    expect(ring!.radius).toBeCloseTo(12);
  });

  it('技能冷却未结束会被拒绝', () => {
    const { e, a } = pair('yanren');
    expect(e.applyInput(a, { type: 'skill' })).toEqual({ ok: true });
    expect(e.applyInput(a, { type: 'skill' }).ok).toBe(false);
  });
});

describe('输入序号回执（客户端回滚依据）', () => {
  it('recordInputSeq 只接受非负有限数，快照回带最后确认序号', () => {
    const e = mkEngine();
    const id = e.players[0].id;
    e.recordInputSeq(id, -1);
    e.recordInputSeq(id, '3' as unknown);
    e.recordInputSeq(id, NaN);
    expect(e.getSnapshot(id).players.find((p) => p.id === id)?.lastInputSeq).toBe(-1);
    e.recordInputSeq(id, 3.9);
    e.recordInputSeq(id, 2); // 乱序不回退
    expect(e.getSnapshot(id).players.find((p) => p.id === id)?.lastInputSeq).toBe(3);
  });

  it('他人快照不包含我的输入序号', () => {
    const e = mkEngine();
    const [a, b] = [e.players[0].id, e.players[1].id];
    e.recordInputSeq(a, 5);
    expect(e.getSnapshot(b).players.find((p) => p.id === b)?.lastInputSeq).toBe(-1);
  });
});

describe('快照投影', () => {
  it('事件增量下发且私有伤害只给双方', () => {
    const e = mkEngine();
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    e.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    const viewA = e.getSnapshot(a);
    const viewB = e.getSnapshot(b);
    expect(viewA.events.some((ev) => ev.kind === 'hit' && ev.targetId === b)).toBe(true);
    expect(viewB.events.some((ev) => ev.kind === 'hit')).toBe(true);
    // 同一事件不应重复下发
    const again = e.getSnapshot(a);
    expect(again.events.filter((ev) => ev.kind === 'hit').length).toBe(0);
  });

  it('快照 arena 含掩体与半场尺寸，供客户端渲染', () => {
    const e = mkEngine();
    const view = e.getSnapshot(e.players[0].id);
    expect(view.arena?.half).toBe(BALANCE.arena.half);
    expect(view.arena?.obstacles.length).toBeGreaterThan(0);
  });

  it('带宽优化：arena 只发一次，私有统计字段仅本人可见', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    const b = e.players[1].id;
    const first = e.getSnapshot(a);
    expect(first.arena).toBeDefined();
    const second = e.getSnapshot(a);
    expect(second.arena).toBeUndefined();
    // 他人快照不含我的私有统计字段
    const other = e.getSnapshot(b);
    expect(other.players.find((p) => p.id === a)?.shots).toBeUndefined();
    expect(other.players.find((p) => p.id === b)?.shots).toBe(0);
    e.resetArenaFor(a);
    expect(e.getSnapshot(a).arena).toBeDefined();
  });
});

describe('视角相对移动换算（客户端方向唯一出口）', () => {
  it('W=画面正前方；D=画面右方（与 Three.js 相机右向量一致）', () => {
    // yaw=0 朝 +z：W 前进 +z；D 应为画面右方 -x
    expect(viewRelativeMove(0, 0, 1)).toEqual({ x: 0, z: 1 });
    expect(viewRelativeMove(0, 1, 0)).toEqual({ x: -1, z: 0 });
    // 转身 180°（朝 -z）：W 后退视觉 → -z，D 视觉右方为 +x
    expect(viewRelativeMove(Math.PI, 0, 1).z).toBeCloseTo(-1);
    expect(viewRelativeMove(Math.PI, 1, 0).x).toBeCloseTo(1);
    // 朝 +x（yaw=π/2）：D 视觉右方为 +z
    expect(viewRelativeMove(Math.PI / 2, 1, 0).z).toBeCloseTo(1);
  });

  it('斜向输入归一化，避免加速', () => {
    const r = viewRelativeMove(0, 1, 1);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1);
  });

  it('集成：引擎按世界系应用 move，W 与视角前方一致（不二次旋转）', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    const p = e.players[0];
    // 沿 z=-16 空旷通道；视角朝 +x（yaw=π/2），W 应往 +x 走
    e.debug.place(a, { x: -11, y: 0, z: -16 }, Math.PI / 2, 0);
    const dir = viewRelativeMove(Math.PI / 2, 0, 1);
    e.applyInput(a, { type: 'move', x: dir.x, z: dir.z });
    for (let i = 0; i < 40; i++) tick(e, 50);
    expect(p.pos.x).toBeGreaterThan(-8);
    expect(p.pos.z).toBeCloseTo(-16, 2);
  });

  it('开镜减速生效（adsSpeedMult）', () => {
    const e = mkEngine();
    start(e);
    const a = e.players[0].id;
    const p = e.players[0];
    const startZ = -16;
    e.debug.place(a, { x: -11, y: 0, z: startZ }, 0, 0);
    e.applyInput(a, { type: 'move', x: 0, z: 1 });
    for (let i = 0; i < 20; i++) tick(e, 50);
    const normalDist = p.pos.z - startZ;
    e.debug.place(a, { x: -11, y: 0, z: startZ }, 0, 0);
    e.applyInput(a, { type: 'ads', pressed: true });
    for (let i = 0; i < 20; i++) tick(e, 50);
    const adsDist = p.pos.z - startZ;
    expect(adsDist).toBeGreaterThan(0);
    expect(adsDist).toBeLessThan(normalDist * 0.8);
  });
});

describe('训练场模式', () => {
  function trainingEngine(): CorcodragonFightEngine {
    return new CorcodragonFightEngine([{ id: 'you', name: '你' }], {
      mode: 'training',
      tickStepMs: 50,
      rng: mulberry32(31),
      trainingTargetRespawnMs: 1200,
      trainingTargets: [
        { id: 'roundFixed', kind: 'round', pattern: 'fixed', pos: { x: -5, y: 0, z: -4 }, hp: 1, radius: 0.8 },
        { id: 'humanFixed', kind: 'human', pattern: 'fixed', pos: { x: 15, y: 0, z: -12 }, hp: 100 },
        { id: 'roundMove', kind: 'round', pattern: 'osc', pos: { x: -5, y: 0, z: -4 }, hp: 1, radius: 0.8, range: 6, speed: 1 },
        { id: 'humanMove', kind: 'human', pattern: 'patrol', pos: { x: 15, y: 0, z: -12 }, hp: 100, range: 6, speed: 0.5 },
      ],
    });
  }

  it('单玩家直接进入对局，生成 4 种靶子', () => {
    const e = trainingEngine();
    expect(e.mode).toBe('training');
    expect(e.phase).toBe('playing');
    expect(e.players).toHaveLength(5);
    expect(e.players.filter((p) => p.targetKind === 'round')).toHaveLength(2);
    expect(e.players.filter((p) => p.targetKind === 'human')).toHaveLength(2);
  });

  it('射击圆靶计入命中统计，靶子会重生且无胜负结算', () => {
    const e = trainingEngine();
    const me = e.players[0];
    const target = e.player('roundFixed')!;
    const zBefore = e.player('roundMove')!.pos.z;
    e.debug.place(me.id, { x: -5, y: 0, z: -16 }, 0, 0);
    for (let i = 0; i < 10; i++) tick(e, 50); // 让移动靶动起来
    expect(e.player('roundMove')!.pos.z).not.toBeCloseTo(zBefore);
    e.applyInput(me.id, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(target.alive).toBe(false);
    const snap = e.getSnapshot(me.id).players.find((p) => p.id === me.id)!;
    expect(snap.shots).toBeGreaterThanOrEqual(1);
    expect(snap.hits).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 40; i++) tick(e, 50); // 1.2s 后重生
    expect(target.alive).toBe(true);
    for (let i = 0; i < 200; i++) tick(e, 50);
    expect(e.phase).toBe('playing'); // 训练场永不 gameOver
  });
});

describe('移动测试 AI（只走位不攻击）', () => {
  it('aiStyle 白名单钳制', () => {
    const e = new CorcodragonFightEngine(mkPlayers(2), {
      aiStyle: 'nuke' as never,
      rng: mulberry32(1),
    });
    expect(e.aiStyle).toBe('combat');
  });

  it('aiLevel 白名单钳制：非法回退 normal', () => {
    const easy = new CorcodragonFightEngine(mkPlayers(2), { aiLevel: 'easy' as never });
    expect(easy.aiLevel).toBe('easy');
    const hard = new CorcodragonFightEngine(mkPlayers(2), { aiLevel: 'hard' as never });
    expect(hard.aiLevel).toBe('hard');
    const bad = new CorcodragonFightEngine(mkPlayers(2), { aiLevel: 'god' as never });
    expect(bad.aiLevel).toBe('normal');
  });

  it('移动 AI 会走动，但 20 秒内不产生任何射击/命中/击杀', () => {
    const e = new CorcodragonFightEngine(mkPlayers(4, true), {
      mode: 'ffa',
      scoreLimit: 5,
      tickStepMs: 50,
      matchTimeMs: 60_000,
      aiStyle: 'movement',
      rng: mulberry32(77),
    });
    const starts = e.players.map((p) => ({ ...p.pos }));
    for (let i = 0; i < 400; i++) tick(e, 50); // 20s
    expect(e.phase).toBe('playing');
    expect(e.players.every((p) => p.alive && p.hp === p.maxHp)).toBe(true);
    expect(e.players.some((p, i) => Math.hypot(p.pos.x - starts[i].x, p.pos.z - starts[i].z) > 2)).toBe(true);
    const kinds = e.events.map((ev) => ev.kind);
    expect(kinds).not.toContain('shot');
    expect(kinds).not.toContain('hit');
    expect(kinds).not.toContain('kill');
  });
});

describe('AI bot 与模糊测试', () => {
  it('4 个 bot 自动打完整局并产生胜者', () => {
    const e = new CorcodragonFightEngine(mkPlayers(4, true), {
      mode: 'ffa',
      scoreLimit: 5,
      tickStepMs: 50,
      matchTimeMs: 120_000,
      rng: mulberry32(99),
    });
    let guard = 0;
    while (e.phase !== 'gameOver' && guard++ < 20_000) tick(e, 50);
    expect(e.phase).toBe('gameOver');
    expect(e.winnerId).toBeTruthy();
    for (const p of e.players) {
      expect(Number.isFinite(p.pos.x)).toBe(true);
      expect(Number.isFinite(p.hp)).toBe(true);
    }
  }, 15_000);

  it('随机非法/合法输入 + 随机 tick 不抛异常（模糊）', () => {
    const e = new CorcodragonFightEngine(mkPlayers(2, false), {
      mode: 'ffa',
      rng: mulberry32(1234),
    });
    const rng = mulberry32(5678);
    const types: RealtimeInputAction['type'][] = [
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
    ];
    const heroPool = [...HERO_IDS, 'bad'];
    const weaponPool = ['rifle', 'sniper', 'pistol', 'dagger', 'bad'];
    for (let i = 0; i < 2000; i++) {
      const id = e.players[Math.floor(rng() * e.players.length)].id;
      const type = types[Math.floor(rng() * types.length)];
      let payload: unknown;
      switch (type) {
        case 'selectHero':
          payload = { type, hero: heroPool[Math.floor(rng() * heroPool.length)] };
          break;
        case 'move':
          payload = { type, x: (rng() * 4 - 2), z: (rng() * 4 - 2) };
          break;
        case 'look':
          payload = { type, yaw: rng() * 10 - 5, pitch: rng() * 6 - 3 };
          break;
        case 'jump':
        case 'fire':
        case 'ads':
          payload = { type, pressed: rng() > 0.5 ? true : (rng() > 0.5 ? 1 : 'x') };
          break;
        case 'switchWeapon':
          payload = { type, weapon: weaponPool[Math.floor(rng() * weaponPool.length)] };
          break;
        default:
          payload = { type };
      }
      const r = e.applyInput(id, payload);
      expect(typeof r.ok).toBe('boolean');
      tick(e, Math.floor(rng() * 120));
      if (e.phase === 'gameOver') break;
    }
    expect(e).toBeDefined();
  }, 15_000);
});
