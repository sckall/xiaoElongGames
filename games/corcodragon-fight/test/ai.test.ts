import { describe, expect, it } from 'vitest';
import { chooseAIInputs } from '../ai';
import { CorcodragonFightEngine } from '../engine';
import type { Snapshot, SnapshotPlayer } from '../defs';

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

function p(partial: Partial<SnapshotPlayer> & { id: string }): SnapshotPlayer {
  return {
    name: partial.id,
    isBot: true,
    team: 'A',
    hero: 'yanren',
    maxHp: 150,
    hp: 150,
    shield: 0,
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    weapon: 'rifle',
    ammo: 30,
    reserve: 90,
    reloading: false,
    reloadT: 0,
    fireCd: 0,
    skillCd: 0,
    ultCharge: 0,
    ads: false,
    stealthT: 0,
    fortifyT: 0,
    onGround: true,
    respawnIn: 0,
    kills: 0,
    deaths: 0,
    score: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    damageDealt: 0,
    spreadBloom: 0,
    targetKind: null,
    hitRadius: 0.55,
    visible: true,
    lastInputSeq: -1,
    ...partial,
  };
}

describe('TDM AI 队伍判别', () => {
  it('只把敌方视为目标：队友在前方也不打、不朝队友走', () => {
    const view = {
      seq: 1,
      t: 1000,
      phase: 'playing',
      youId: 'me',
      mode: 'tdm',
      scoreLimit: 15,
      timeLeft: 500_000,
      heroSelectLeft: 0,
      players: [
        p({ id: 'me', team: 'A', pos: { x: -11, y: 0, z: 0 }, yaw: 0 }),
        p({ id: 'ally', team: 'A', pos: { x: -7, y: 0, z: 0 }, yaw: Math.PI }),
        p({ id: 'enemy', team: 'B', pos: { x: -11, y: 0, z: 12 }, yaw: Math.PI }),
      ],
      effects: [],
      events: [],
      winnerId: null,
      winnerTeam: null,
      teamScores: { A: 0, B: 0 },
      arena: { half: 20, obstacles: [] },
    } as unknown as Snapshot;
    const actions = chooseAIInputs(view, { rng: mulberry32(9) });
    // 目标必须是 +z 方向的敌人：视线 yaw≈0（队友在 +x 方向）
    const look = actions.find((a) => a.type === 'look');
    expect(look?.type).toBe('look');
    if (look && look.type === 'look') {
      expect(Math.abs(look.yaw)).toBeLessThan(0.05);
    }
    // 移动允许横向拉扯，但不能以“队友方向”为主目标
    const move = actions.find((a) => a.type === 'move');
    if (move && move.type === 'move') {
      expect(move.z).toBeGreaterThan(0.15);
      expect(move.x < 0.9 || move.z > 0.1).toBe(true);
    }
    // 敌人可见且在准星内 → 开火；队友不会被选中
    const fire = actions.find((a) => a.type === 'fire');
    expect(fire && fire.type === 'fire' && fire.pressed).toBe(true);
  });

  it('FFA 下其他所有玩家都是敌人', () => {
    const view = {
      seq: 1,
      t: 1000,
      phase: 'playing',
      youId: 'me',
      mode: 'ffa',
      scoreLimit: 15,
      timeLeft: 500_000,
      heroSelectLeft: 0,
      players: [
        p({ id: 'me', team: 'A', pos: { x: -11, y: 0, z: 0 }, yaw: 0 }),
        p({ id: 'other', team: 'A', pos: { x: -11, y: 0, z: 8 }, yaw: Math.PI }),
      ],
      effects: [],
      events: [],
      winnerId: null,
      winnerTeam: null,
      teamScores: { A: 0, B: 0 },
      arena: { half: 20, obstacles: [] },
    } as unknown as Snapshot;
    const actions = chooseAIInputs(view, { rng: mulberry32(9) });
    const fire = actions.find((a) => a.type === 'fire');
    expect(fire && fire.type === 'fire' && fire.pressed).toBe(true);
  });
});

describe('TDM bot 对局伤害归属', () => {
  it('整局 bot 击杀事件中，击杀者与目标永远不同队', () => {
    const e = new CorcodragonFightEngine(
      Array.from({ length: 6 }, (_, i) => ({ id: `bot${i}`, name: `B${i}`, isBot: true })),
      { mode: 'tdm', scoreLimit: 5, matchTimeMs: 120_000, rng: mulberry32(2024) },
    );
    let guard = 0;
    while (e.phase !== 'gameOver' && guard++ < 20_000) e.tick(50);
    expect(e.phase).toBe('gameOver');
    const kills = e.killLog.filter((k) => k.shooterId);
    expect(kills.length).toBeGreaterThan(0);
    for (const ev of kills) {
      const shooter = e.player(ev.shooterId!);
      const target = e.player(ev.targetId);
      expect(shooter?.team).not.toBe(target?.team);
    }
  }, 15_000);
});
