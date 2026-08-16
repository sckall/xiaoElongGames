/**
 * RealtimeRoom：realtime（FPS/动作）游戏的房间实现。
 *
 * 与 turn-based Room（room.ts）平行存在，不修改旧房间逻辑：
 * - 复用大厅语义：房间码/密码/座位/房主转移/空房回收/房间列表；
 * - 对局期：每个房间一个服务端权威引擎（@tm/game-corcodragon-fight），
 *   50ms tick 循环 + 对每个在线真人广播 getSnapshot(playerId)；
 * - 输入：客户端 `rtInput { input }` → engine.applyInput（白名单校验）；
 * - 断线托管：真人断线即转引擎 bot 接管（AI 只用该座位视角），重连恢复真人输入。
 */
import { randomUUID } from 'node:crypto';
import { createEngine } from '@tm/game-corcodragon-fight';
import type { CorcodragonFightEngine } from '@tm/game-corcodragon-fight';
import {
  AUTOPILOT_DELAYS,
  DEFAULT_ROOM_SETTINGS,
  type LobbyInfo,
  type RoomListItem,
  type RoomSettings,
} from '@tm/rules';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@tm/rules';
import { sanitizeName, sanitizePassword, type RoomSocketData } from './room';
import { MAX_RT_INPUT_PER_SEC, sanitizeRoomSettings } from './security';

export const RT_GAME_ID = 'corcodragon-fight';
export const RT_TICK_MS = 50;
const RT_MIN_PLAYERS = 2;
const RT_MAX_PLAYERS = 7;
const BOT_NAMES = ['阿呆', '梅林', '小圆', '老巴', '铁柱', '花卷'];

export type RealtimeRoomSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, RoomSocketData>;

interface RealtimeSeat {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  /** 真人断线/离开后由引擎 bot 接管（重连即恢复） */
  autopilot: boolean;
  socketId: string | null;
}

export class RealtimeRoom {
  readonly code: string;
  readonly gameId = RT_GAME_ID;
  hostId: string;
  status: 'lobby' | 'playing' = 'lobby';
  seats: RealtimeSeat[] = [];
  engine: CorcodragonFightEngine | null = null;
  settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  password = '';
  config: Record<string, unknown> | undefined;

  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private onEmpty: (code: string) => void;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastErrorAt = new Map<string, number>();
  private inputRate = new Map<string, { count: number; windowStart: number }>();

  constructor(
    code: string,
    hostId: string,
    hostName: string,
    config: Record<string, unknown> | undefined,
    password: string | undefined,
    botCount: number | undefined,
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    onEmpty: (code: string) => void,
  ) {
    this.code = code;
    this.hostId = hostId;
    this.io = io;
    this.onEmpty = onEmpty;
    this.config = config && typeof config === 'object' ? config : undefined;
    this.password = sanitizePassword(password);
    this.seats.push({
      id: hostId,
      name: hostName,
      isBot: false,
      connected: true,
      autopilot: false,
      socketId: null,
    });
    this.addBots(Math.max(0, Math.min(RT_MAX_PLAYERS - 1, Math.floor(Number(botCount) || 0))));
  }

  private addBots(count: number): void {
    const have = this.seats.filter((s) => s.isBot).length;
    for (let i = have; i < count; i++) {
      this.seats.push({
        id: `bot-${this.code}-${i + 1}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        isBot: true,
        connected: true,
        autopilot: true,
        socketId: null,
      });
    }
  }

  private seat(id: string): RealtimeSeat | undefined {
    return this.seats.find((s) => s.id === id);
  }

  attach(socketId: string, playerId: string): void {
    const s = this.seat(playerId);
    if (s) s.socketId = socketId;
  }

  lobbyInfo(): LobbyInfo {
    return {
      code: this.code,
      hostId: this.hostId,
      status: this.status,
      gameId: this.gameId,
      config: this.config,
      players: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        isHost: s.id === this.hostId,
        connected: s.connected,
        autopilot: s.autopilot,
      })),
      botCount: this.seats.filter((s) => s.isBot).length,
      humanCount: this.seats.filter((s) => !s.isBot).length,
      settings: { ...this.settings },
      hasPassword: this.password !== '',
    };
  }

  listItem(): RoomListItem {
    return {
      code: this.code,
      gameId: this.gameId,
      playerCount: this.seats.length,
      maxPlayers: RT_MAX_PLAYERS,
      hasPassword: this.password !== '',
      status: this.status,
    };
  }

  broadcastLobby(): void {
    this.io.to(this.code).emit('lobby', this.lobbyInfo());
  }

  broadcastSnapshots(): void {
    if (!this.engine) return;
    for (const s of this.seats) {
      if (!s.isBot && s.connected && s.socketId) {
        // volatile：快照是“最新状态为准”的数据。客户端渲染/网络落后时直接丢弃
        // 排队中的旧快照，避免慢连接积压后一次性吐出一串过期状态造成卡顿。
        this.io.to(s.socketId).volatile.emit('rtSnapshot', this.engine.getSnapshot(s.id));
      }
    }
  }

  emitSnapshotTo(socketId: string, playerId: string): void {
    if (!this.engine) return;
    this.engine.resetArenaFor(playerId);
    this.io.to(socketId).emit('rtSnapshot', this.engine.getSnapshot(playerId));
  }

  private emitError(socketId: string | null, message: string): void {
    if (!socketId) return;
    const now = Date.now();
    const last = this.lastErrorAt.get(socketId) ?? 0;
    if (now - last < 1000) return; // 1s 节流，避免非法输入刷屏
    this.lastErrorAt.set(socketId, now);
    this.io.to(socketId).emit('error', message);
  }

  join(
    nameRaw: string,
    token: string | undefined,
    socketId: string,
    passwordRaw?: string,
  ): { ok: true; playerId: string; rejoin: boolean } | { ok: false; error: string } {
    const name = sanitizeName(nameRaw);
    if (token) {
      const existing = this.seat(token);
      if (existing) {
        if (existing.connected && existing.socketId !== socketId) {
          return { ok: false, error: '该座位已在线（如确认本人，请先关闭旧窗口）' };
        }
        existing.connected = true;
        existing.autopilot = false;
        if (!existing.isBot) existing.name = name;
        existing.socketId = socketId;
        this.engine?.setAutopilot(token, false);
        this.engine?.resetArenaFor(token);
        this.broadcastSnapshots();
        this.broadcastLobby();
        return { ok: true, playerId: token, rejoin: true };
      }
      return { ok: false, error: '重连凭据无效（座位不存在），请直接加入' };
    }
    if (this.password !== '' && sanitizePassword(passwordRaw) !== this.password) {
      return { ok: false, error: '密码错误' };
    }
    if (this.status === 'playing') return { ok: false, error: '对局已开始，无法加入新玩家' };
    if (this.seats.filter((s) => !s.isBot).length >= RT_MAX_PLAYERS) {
      return { ok: false, error: '房间已满' };
    }
    const id = randomUUID();
    this.seats.push({
      id,
      name,
      isBot: false,
      connected: true,
      autopilot: false,
      socketId,
    });
    return { ok: true, playerId: id, rejoin: false };
  }

  setBots(actorId: string, count: number, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以调整 AI');
    if (this.status !== 'lobby') return;
    const humans = this.seats.filter((s) => !s.isBot);
    const maxBots = RT_MAX_PLAYERS - humans.length;
    const c = Math.max(0, Math.min(maxBots, Math.floor(Number(count) || 0)));
    this.seats = this.seats.filter((s) => !s.isBot);
    this.addBots(c);
    this.broadcastLobby();
  }

  updateSettings(actorId: string, patch: Partial<RoomSettings>, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以修改房间设置');
    this.settings = sanitizeRoomSettings({ ...this.settings, ...patch });
    this.broadcastLobby();
  }

  setPassword(actorId: string, passwordRaw: string, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以设置密码');
    this.password = sanitizePassword(passwordRaw);
    this.broadcastLobby();
  }

  /** 开始对局（仅房主，2-7 人，可含 AI） */
  start(actorId: string, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以开始游戏');
    if (this.status === 'playing') return;
    const total = this.seats.length;
    if (total < RT_MIN_PLAYERS || total > RT_MAX_PLAYERS) {
      return this.emitError(actorSocketId, `需要 ${RT_MIN_PLAYERS}-${RT_MAX_PLAYERS} 名玩家（可添加 AI）`);
    }
    this.engine = createEngine(
      this.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })),
      this.config,
    );
    this.status = 'playing';
    this.engine.log(`🎮 联机对局开始（同步 ${Math.round(1000 / this.engine.tickStepMs)}Hz）`);
    this.broadcastSnapshots();
    this.broadcastLobby();
    this.startTick();
  }

  private startTick(): void {
    this.stopTick();
    const step = this.engine?.tickStepMs ?? RT_TICK_MS;
    this.tickTimer = setInterval(() => {
      if (!this.engine) return;
      try {
        this.engine.tick(step);
        this.broadcastSnapshots();
        if (this.engine.phase === 'gameOver') this.stopTick();
      } catch (err) {
        console.error('[realtime-room] tick error:', err);
      }
    }, step);
  }

  private stopTick(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  applyRealtimeInput(playerId: string, payload: unknown, socketId: string): void {
    if (!this.engine || this.status !== 'playing') return;
    const envelope =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { input?: unknown; seq?: unknown })
        : { input: payload };

    // 输入洪泛保护：每玩家每秒最多 120 条；超限仍回执 seq，但丢弃输入
    const now = Date.now();
    const win = this.inputRate.get(playerId);
    if (win && now - win.windowStart >= 1000) {
      this.inputRate.delete(playerId);
    }
    const rec = this.inputRate.get(playerId) ?? { count: 0, windowStart: now };
    rec.count += 1;
    this.inputRate.set(playerId, rec);
    this.engine.recordInputSeq(playerId, envelope.seq);
    if (rec.count > MAX_RT_INPUT_PER_SEC) {
      this.emitError(socketId, '操作太快啦，已忽略部分指令');
      return;
    }

    const r = this.engine.applyInput(playerId, envelope.input);
    if (!r.ok) this.emitError(socketId, r.error ?? '非法输入');
  }

  onDisconnect(playerId: string): void {
    const s = this.seat(playerId);
    if (!s) return;
    s.connected = false;
    s.socketId = null;
    this.transferHostIfNeeded(playerId);
    if (this.status === 'playing') {
      s.autopilot = true;
      this.engine?.setAutopilot(playerId, true);
      this.broadcastSnapshots();
      this.broadcastLobby();
    } else {
      this.broadcastLobby();
    }
    this.maybeClose();
  }

  onLeave(playerId: string): void {
    const s = this.seat(playerId);
    if (!s) return;
    if (this.status === 'lobby') {
      this.seats = this.seats.filter((x) => x.id !== playerId);
      if (this.seats.length === 0) {
        this.close();
        return;
      }
      this.transferHostIfNeeded(playerId);
      this.broadcastLobby();
      return;
    }
    s.connected = false;
    s.socketId = null;
    s.autopilot = true;
    this.transferHostIfNeeded(playerId);
    this.engine?.setAutopilot(playerId, true);
    this.broadcastSnapshots();
    this.broadcastLobby();
    this.maybeClose();
  }

  private transferHostIfNeeded(leavingId: string): void {
    if (this.hostId !== leavingId) return;
    const next = this.seats.find((s) => !s.isBot && s.connected && s.id !== leavingId);
    if (next) this.hostId = next.id;
  }

  private maybeClose(): void {
    const anyHumanConnected = this.seats.some((s) => !s.isBot && s.connected);
    if (!anyHumanConnected) this.close();
  }

  private close(): void {
    this.stopTick();
    this.inputRate.clear();
    this.onEmpty(this.code);
  }
}
