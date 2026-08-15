import { describe, expect, it } from 'vitest';
import { CorcodragonFightEngine } from '../engine';
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

  it('选项白名单钳制', () => {
    const e = new CorcodragonFightEngine(mkPlayers(2), {
      mode: 'nuke' as never,
      scoreLimit: NaN,
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
    // 沿 z=-19 通道横穿，避开所有掩体，验证左右围墙
    e.debug.place(a, { x: -19, y: 0, z: -19 }, 0, 0);
    e.applyInput(a, { type: 'move', x: 1, z: 0 });
    for (let i = 0; i < 200; i++) tick(e, 50);
    expect(p.pos.x).toBeGreaterThan(0);
    expect(p.pos.x).toBeLessThanOrEqual(20 - PLAYER_RADIUS + 1e-6);
    expect(p.pos.x).toBeGreaterThanOrEqual(-20 + PLAYER_RADIUS - 1e-6);
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
    // 放在 x=-11 的空旷走廊上，A 朝 +z 面朝 B，弹道无遮挡
    e.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
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
      rng: mulberry32(7),
    });
    for (const p of t.players) {
      if (!p.isBot) t.applyInput(p.id, { type: 'selectHero', hero: 'yanren' });
    }
    while (t.phase === 'heroSelect') t.tick(50);
    const a = t.players[0].id; // A 队
    const teammate = t.players[2].id; // A 队
    expect(t.players[0].team).toBe(t.players[2].team);
    t.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    t.debug.place(teammate, { x: -11, y: 0, z: -1 }, Math.PI, 0);
    t.applyInput(a, { type: 'fire', pressed: true });
    t.tick(50);
    expect(t.player(teammate)!.hp).toBe(t.player(teammate)!.maxHp);
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
      rng: mulberry32(3),
    });
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    const ap = e.player(a)!;
    const bp = e.player(b)!;
    e.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
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

  it('死亡 3 秒后自动重生并回满状态', () => {
    const e = mkEngine();
    start(e);
    const [a, b] = [e.players[0].id, e.players[1].id];
    const bp = e.player(b)!;
    e.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
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
});

describe('英雄技能与终极技', () => {
  function pair(heroA: string, heroB = 'tiebi'): { e: CorcodragonFightEngine; a: string; b: string } {
    const e = mkEngine();
    start(e, heroA);
    const [a, b] = [e.players[0].id, e.players[1].id];
    e.debug.place(a, { x: -11, y: 0, z: -6 }, 0, 0);
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
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

  it('影枭：隐身对敌人不可见，破隐一击双倍伤害', () => {
    const { e, a, b } = pair('yingxiao');
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    const viewB = e.getSnapshot(b);
    const hidden = viewB.players.find((p) => p.id === a)!;
    expect(hidden.visible).toBe(false);
    expect(hidden.pos.y).toBe(-100);
    const viewA = e.getSnapshot(a);
    expect(viewA.players.find((p) => p.id === a)!.stealthT).toBeGreaterThan(0);
    // 破隐一击：步枪 20 → 40（与命中前后血量差核对，避免英雄血量差异干扰）
    const bp = e.player(b)!;
    const hpBefore = bp.hp;
    e.applyInput(a, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(hpBefore - bp.hp).toBe(40);
    const after = e.getSnapshot(b);
    expect(after.players.find((p) => p.id === a)!.visible).toBe(true);
  });

  it('铁壁：护盾先吸收伤害', () => {
    const { e, a, b } = pair('tiebi');
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    const ap = e.player(a)!;
    expect(ap.shield).toBe(80);
    // 让 b 面朝 a 射击（a 在 -6，b 在 -1）
    e.debug.place(b, { x: -11, y: 0, z: -1 }, Math.PI, 0);
    e.applyInput(b, { type: 'fire', pressed: true });
    tick(e, 50);
    expect(ap.hp).toBe(ap.maxHp);
    expect(ap.shield).toBe(60);
  });

  it('灵音：治愈波回血', () => {
    const { e, a } = pair('lingyin');
    const ap = e.player(a)!;
    ap.hp = 50;
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    expect(ap.hp).toBe(95);
  });

  it('诡雷：粘性炸弹延迟爆炸伤害敌人', () => {
    const { e, a, b } = pair('guilei');
    // 把敌人移到炸弹落点（z=20 围墙）附近
    e.debug.place(b, { x: -11, y: 0, z: 19 }, Math.PI, 0);
    const bp = e.player(b)!;
    e.applyInput(a, { type: 'skill' });
    tick(e, 50);
    expect(bp.hp).toBe(bp.maxHp); // 未爆炸
    for (let i = 0; i < 40; i++) tick(e, 50);
    expect(bp.hp).toBeLessThan(bp.maxHp);
  });

  it('终极技需要 100 充能；炎刃焚天烈焰范围伤害', () => {
    const { e, a, b } = pair('yanren');
    const bp = e.player(b)!;
    expect(e.applyInput(a, { type: 'ult' }).ok).toBe(false);
    e.debug.setUltCharge(a, 100);
    expect(e.applyInput(a, { type: 'ult' })).toEqual({ ok: true });
    tick(e, 50);
    // 5 米距离上爆炸伤害按距离衰减（80 × (1-5/9×0.5) ≈ 58）
    expect(bp.hp).toBeLessThanOrEqual(bp.maxHp - 50);
    // 释放后立即清零；同一 tick 会自然回复 0.1 点充能
    expect(e.player(a)!.ultCharge).toBeLessThanOrEqual(0.11);
  });

  it('技能冷却未结束会被拒绝', () => {
    const { e, a } = pair('yanren');
    expect(e.applyInput(a, { type: 'skill' })).toEqual({ ok: true });
    expect(e.applyInput(a, { type: 'skill' }).ok).toBe(false);
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
    expect(view.arena.half).toBe(20);
    expect(view.arena.obstacles.length).toBeGreaterThan(0);
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
});

describe('移动测试 AI（只走位不攻击）', () => {
  it('aiStyle 白名单钳制', () => {
    const e = new CorcodragonFightEngine(mkPlayers(2), {
      aiStyle: 'nuke' as never,
      rng: mulberry32(1),
    });
    expect(e.aiStyle).toBe('combat');
  });

  it('移动 AI 会走动，但 20 秒内不产生任何射击/命中/击杀', () => {
    const e = new CorcodragonFightEngine(mkPlayers(4, true), {
      mode: 'ffa',
      scoreLimit: 5,
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
