import { describe, expect, it } from 'vitest';
import {
  MAX_JOIN_CODE_LEN,
  MAX_RT_INPUT_PER_SEC,
  clientIp,
  sanitizeJoinCode,
  sanitizeRoomSettings,
} from '../src/security';
import { DEFAULT_ROOM_SETTINGS } from '@tm/rules';
import { genRoomCode } from '../src/room';
import { RealtimeRoom, RT_GAME_ID } from '../src/realtime-room';
import { createEngine } from '@tm/game-corcodragon-fight';

describe('IP 识别（防 X-Forwarded-For 伪造）', () => {
  it('未开启 TRUST_PROXY 时忽略客户端伪造的 XFF', () => {
    const ip = clientIp(
      { address: '10.0.0.8', headers: { 'x-forwarded-for': '1.2.3.4' } },
      false,
    );
    expect(ip).toBe('10.0.0.8');
  });

  it('开启 TRUST_PROXY 时取 XFF 第一个地址', () => {
    const ip = clientIp(
      { address: '10.0.0.8', headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } },
      true,
    );
    expect(ip).toBe('1.2.3.4');
  });

  it('缺失地址回退 unknown，超长地址截断', () => {
    expect(clientIp({}, false)).toBe('unknown');
    expect(clientIp({ address: 'a'.repeat(200) }, false)).toHaveLength(64);
  });
});

describe('输入裁剪', () => {
  it('房间码只保留字母数字并限长', () => {
    expect(sanitizeJoinCode(' ab12!@#$ ')).toBe('AB12');
    expect(sanitizeJoinCode('A'.repeat(100))).toHaveLength(MAX_JOIN_CODE_LEN);
    expect(sanitizeJoinCode(null)).toBe('');
  });

  it('房间设置白名单：忽略伪造字段、钳制越界数值', () => {
    const s = sanitizeRoomSettings({
      aiSpeed: 1_000_000,
      autopilot: 'wait15s',
      isAdmin: true,
      __proto__: { hacked: true },
    } as unknown as Record<string, unknown>);
    expect(s.aiSpeed).toBe(4000);
    expect(s.autopilot).toBe('wait15s');
    expect((s as unknown as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it('非法 autopilot 回退默认值', () => {
    const s = sanitizeRoomSettings({ autopilot: 'instant-delete' });
    expect(s.autopilot).toBe(DEFAULT_ROOM_SETTINGS.autopilot);
  });

  it('房间码生成不含易混淆字符且长度固定', () => {
    for (let i = 0; i < 200; i++) {
      const code = genRoomCode();
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^[A-Z0-9]{4}$/);
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });
});

describe('realtime 输入洪泛保护', () => {
  it('每玩家每秒超过上限的输入被丢弃（不回退已确认 seq）', () => {
    const fakeIo = { to: () => ({ emit: () => undefined }) } as never;
    const room = new RealtimeRoom(
      'TEST',
      'host-id',
      '房主',
      { mode: 'ffa', scoreLimit: 5 },
      undefined,
      1,
      fakeIo,
      () => undefined,
    );
    // 绕过 start() 的定时器，直接构造进行中的引擎状态用于单测
    const engine = createEngine(
      room.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })),
      { mode: 'ffa', scoreLimit: 5 },
    );
    while (engine.phase === 'heroSelect') engine.tick(50);
    (room as unknown as { engine: unknown }).engine = engine;
    (room as unknown as { status: string }).status = 'playing';

    const total = MAX_RT_INPUT_PER_SEC + 20;
    for (let i = 0; i < total; i++) {
      room.applyRealtimeInput('host-id', { input: { type: 'move', x: i % 2, z: 0 }, seq: i }, 'sock');
    }
    // 前 120 条被应用：最后一个被应用的序号是 119（x=1），121+ 被丢弃
    expect(engine.player('host-id')?.moveX).toBe(1);
    expect(engine.getSnapshot('host-id').players.find((p) => p.id === 'host-id')?.lastInputSeq).toBe(
      total - 1,
    );
  });
});

describe('realtime 房间基本契约', () => {
  it('gameId 与大厅列表字段正确', () => {
    const fakeIo = { to: () => ({ emit: () => undefined }) } as never;
    const room = new RealtimeRoom('TEST', 'h', '房主', undefined, 'pw', 0, fakeIo, () => undefined);
    expect(room.gameId).toBe(RT_GAME_ID);
    expect(room.listItem().hasPassword).toBe(true);
  });
});
