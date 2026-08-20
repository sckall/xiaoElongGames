/**
 * 房间：封装大厅 → 对局 → 结算的完整生命周期。
 *
 * 断线/退出管理方案：
 * - 身份 = (房间码, playerId)。playerId 保存在玩家本机 localStorage，凭它重连恢复座位。
 * - 断线后按房间设置「托管策略」等待一段时间再交给 AI 托管；
 *   等待期内真人重连 → 恢复真人控制（AI 只是临时代理，真人回来即接管）。
 * - 房主断线 → 房主身份转移给其他在线真人（大厅/对局均可）。
 * - 所有真人离开/断开 → 房间自动关闭。
 */
import { randomUUID } from 'node:crypto';
import {
  Game,
  MIN_PLAYERS,
  chooseAiAction,
  type Magic,
} from '@tm/rules';
import {
  AUTOPILOT_DELAYS,
  DEFAULT_ROOM_SETTINGS,
  GAME_ID,
  MAX_PASSWORD_LEN,
  MAX_PLAYERS,
  type LobbyInfo,
  type RoomListItem,
  type RoomSettings,
} from '@tm/rules';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@tm/rules';
import { sanitizeRoomSettings } from './security';

const BOT_NAMES = ['阿呆', '梅林', '小圆', '老巴'];
const BOT_RISKS = [0.15, 0.28, 0.42, 0.55];

export type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, RoomSocketData>;

export interface RoomSocketData {
  roomCode?: string;
  playerId?: string;
  /**
   * 账号级 userId（v8.1+ 协议）。
   * 客户端首次访问时生成 localStorage 持久化，跨会话不变。
   * 当前 v8.1 仅记录到 socket.data，不参与业务逻辑；
   * 后续接入 Steamworks / OAuth 时会替换为真实 SteamID / OAuth sub。
   */
  userId?: string;
}

interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  autoPlay: boolean; // AI 托管中（断线/离开触发，真人回来即取消）
  disconnectedAt: number | null; // 断线时刻，用于托管等待计时
  socketId: string | null;
}

export function sanitizeName(raw: unknown): string {
  const s = String(raw ?? '').trim().slice(0, 12);
  return s || '无名法师';
}

export function sanitizePassword(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, MAX_PASSWORD_LEN);
}

export function genRoomCode(): string {
  // 去掉易混淆字符 0/O/1/I/L
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export class Room {
  readonly code: string;
  hostId: string;
  status: 'lobby' | 'playing' = 'lobby';
  seats: Seat[] = [];
  game: Game | null = null;
  settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  password = '';

  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private onEmpty: (code: string) => void;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private roundTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    code: string,
    hostId: string,
    hostName: string,
    settings: Partial<RoomSettings> | undefined,
    password: string | undefined,
    botCount: number | undefined,
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    onEmpty: (code: string) => void,
  ) {
    this.code = code;
    this.hostId = hostId;
    this.io = io;
    this.onEmpty = onEmpty;
    this.settings = sanitizeRoomSettings(settings);
    this.password = sanitizePassword(password);
    this.seats.push({
      id: hostId,
      name: hostName,
      isBot: false,
      connected: true,
      autoPlay: false,
      disconnectedAt: null,
      socketId: null,
    });
    this.addBots(Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(botCount ?? 0))));
  }

  private addBots(count: number): void {
    const have = this.seats.filter((s) => s.isBot).length;
    for (let i = have; i < count; i++) {
      this.seats.push({
        id: `bot-${this.code}-${i + 1}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        isBot: true,
        connected: true,
        autoPlay: true,
        disconnectedAt: null,
        socketId: null,
      });
    }
  }

  private seat(id: string): Seat | undefined {
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
      players: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isBot: s.isBot,
        isHost: s.id === this.hostId,
        connected: s.connected,
        autopilot: s.autoPlay,
      })),
      botCount: this.seats.filter((s) => s.isBot).length,
      humanCount: this.seats.filter((s) => !s.isBot).length,
      settings: { ...this.settings },
      hasPassword: this.password !== '',
    };
  }

  /** 房间列表项（公开） */
  listItem(): RoomListItem {
    return {
      code: this.code,
      gameId: GAME_ID,
      playerCount: this.seats.length,
      maxPlayers: MAX_PLAYERS,
      hasPassword: this.password !== '',
      status: this.status,
    };
  }

  broadcastLobby(): void {
    this.io.to(this.code).emit('lobby', this.lobbyInfo());
  }

  broadcastViews(): void {
    if (!this.game) return;
    for (const s of this.seats) {
      if (!s.isBot && s.connected && s.socketId) {
        this.io.to(s.socketId).emit('state', this.game.getView(s.id));
      }
    }
  }

  emitViewTo(socketId: string, playerId: string): void {
    if (!this.game) return;
    this.io.to(socketId).emit('state', this.game.getView(playerId));
  }

  private emitError(socketId: string | null, message: string): void {
    if (socketId) this.io.to(socketId).emit('error', message);
  }

  /** 加入房间（新玩家不带 token；重连带 token 恢复座位；有锁房间校验密码） */
  join(nameRaw: string, token: string | undefined, socketId: string, passwordRaw?: string):
    | { ok: true; playerId: string; rejoin: boolean }
    | { ok: false; error: string } {
    const name = sanitizeName(nameRaw);
    if (token) {
      const existing = this.seat(token);
      if (existing) {
        if (existing.connected && existing.socketId !== socketId) {
          return { ok: false, error: '该座位已在线（如确认本人，请先关闭旧窗口）' };
        }
        existing.connected = true;
        existing.autoPlay = false;
        existing.disconnectedAt = null;
        if (!existing.isBot) existing.name = name;
        existing.socketId = socketId;
        if (this.game) this.game.log(`${existing.name} 重新上线，恢复操作 ✅`);
        this.broadcastViews();
        this.broadcastLobby();
        this.schedule();
        return { ok: true, playerId: token, rejoin: true };
      }
      return { ok: false, error: '重连凭据无效（座位不存在），请直接加入' };
    }
    if (this.password !== '' && sanitizePassword(passwordRaw) !== this.password) {
      return { ok: false, error: '密码错误' };
    }
    if (this.status === 'playing') return { ok: false, error: '对局已开始，无法加入新玩家' };
    if (this.seats.filter((s) => !s.isBot).length >= MAX_PLAYERS) {
      return { ok: false, error: '房间已满' };
    }
    const id = randomUUID();
    this.seats.push({
      id,
      name,
      isBot: false,
      connected: true,
      autoPlay: false,
      disconnectedAt: null,
      socketId,
    });
    return { ok: true, playerId: id, rejoin: false };
  }

  /** 设置 AI 座位数（仅房主、仅大厅） */
  setBots(actorId: string, count: number, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以调整 AI');
    if (this.status !== 'lobby') return;
    const humans = this.seats.filter((s) => !s.isBot);
    const bots = this.seats.filter((s) => s.isBot);
    const maxBots = MAX_PLAYERS - humans.length;
    const c = Math.max(0, Math.min(maxBots, Math.floor(count)));
    this.seats = this.seats.filter((s) => !s.isBot || bots.indexOf(s) < c);
    this.addBots(c);
    this.broadcastLobby();
  }

  /** 房间设置（仅房主；大厅/对局均可改；白名单校验防伪造） */
  updateSettings(actorId: string, patch: Partial<RoomSettings>, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以修改房间设置');
    this.settings = sanitizeRoomSettings({ ...this.settings, ...patch });
    this.broadcastLobby();
    this.schedule();
  }

  /** 设置/清除房间密码（仅房主） */
  setPassword(actorId: string, passwordRaw: string, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以设置密码');
    this.password = sanitizePassword(passwordRaw);
    this.broadcastLobby();
  }

  /** 开始对局（仅房主，总人数 2~5） */
  start(actorId: string, actorSocketId: string): void {
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以开始游戏');
    if (this.status === 'playing') return;
    const total = this.seats.length;
    if (total < MIN_PLAYERS || total > MAX_PLAYERS) {
      return this.emitError(actorSocketId, `需要 ${MIN_PLAYERS}-${MAX_PLAYERS} 名玩家（可添加 AI）`);
    }
    this.game = new Game({
      players: this.seats.map((s) => ({ id: s.id, name: s.name, isBot: s.isBot })),
    });
    this.status = 'playing';
    this.game.log('🎮 联机对局开始');
    this.broadcastViews();
    this.broadcastLobby();
    this.schedule();
  }

  declareSpell(playerId: string, magic: Magic, socketId: string): void {
    if (!this.game || this.status !== 'playing') return;
    const r = this.game.declareSpell(playerId, magic);
    if (!r.ok) {
      this.emitError(socketId, r.error);
      return;
    }
    this.broadcastViews();
    this.schedule();
  }

  endTurn(playerId: string, socketId: string): void {
    if (!this.game || this.status !== 'playing') return;
    const r = this.game.endTurn(playerId);
    if (!r.ok) {
      this.emitError(socketId, r.error);
      return;
    }
    this.broadcastViews();
    this.schedule();
  }

  /** 本轮结算后由房主触发下一轮 */
  nextRound(actorId: string, actorSocketId: string): void {
    if (!this.game || this.status !== 'playing') return;
    if (actorId !== this.hostId) return this.emitError(actorSocketId, '只有房主可以开始下一轮');
    if (this.game.phase !== 'roundEnd') return this.emitError(actorSocketId, '本轮尚未结束');
    this.game.nextRound();
    this.broadcastViews();
    this.schedule();
  }

  /** 当前玩家是否需要服务端代打（AI / 断线到期托管） */
  private needsAutoPlay(seat: Seat): boolean {
    if (seat.isBot || seat.autoPlay) return true;
    if (!seat.connected) {
      const wait = AUTOPILOT_DELAYS[this.settings.autopilot];
      if (wait <= 0) return true;
      if (seat.disconnectedAt == null) return true;
      return Date.now() - seat.disconnectedAt >= wait;
    }
    return false;
  }

  /** 调度：AI 回合 / 托管回合 / 断线等待重连（轮末由房主手动开始下一轮） */
  private schedule(): void {
    this.clearTimers();
    const game = this.game;
    if (!game || this.status !== 'playing') return;
    if (game.phase === 'gameOver' || game.phase === 'roundEnd') return;
    const cur = game.current;
    const seat = this.seat(cur.id);
    if (!seat) return;
    if (this.needsAutoPlay(seat)) {
      // 断线但还没到托管时间 → 到点再检查（期间真人可能重连）
      if (!seat.isBot && !seat.autoPlay && !seat.connected) {
        const wait = AUTOPILOT_DELAYS[this.settings.autopilot];
        const elapsed = seat.disconnectedAt ? Date.now() - seat.disconnectedAt : Infinity;
        if (elapsed < wait) {
          this.botTimer = setTimeout(() => this.schedule(), wait - elapsed + 50);
          return;
        }
        // 到期：正式转托管
        seat.autoPlay = true;
        game.log(`${seat.name} 断线超时，由 AI 托管 🤖`);
        this.broadcastLobby();
      }
      const idx = this.seats.indexOf(seat);
      const risk = BOT_RISKS[Math.max(0, idx) % BOT_RISKS.length];
      const delay = Math.max(300, this.settings.aiSpeed);
      this.botTimer = setTimeout(() => {
        const a = chooseAiAction(game.getView(cur.id), { risk });
        if (a.type === 'declare') game.declareSpell(cur.id, a.magic);
        else game.endTurn(cur.id);
        this.broadcastViews();
        this.schedule();
      }, delay);
    }
  }

  private clearTimers(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.botTimer = null;
    this.roundTimer = null;
  }

  /** 断线：座位保留，按托管策略等待后由 AI 代理 */
  onDisconnect(playerId: string): void {
    const s = this.seat(playerId);
    if (!s) return;
    s.connected = false;
    s.socketId = null;
    this.transferHostIfNeeded(playerId);
    if (this.status === 'playing') {
      s.disconnectedAt = Date.now();
      const wait = AUTOPILOT_DELAYS[this.settings.autopilot];
      this.game?.log(
        wait > 0
          ? `${s.name} 断线，${Math.round(wait / 1000)} 秒内重连可恢复 ⏳`
          : `${s.name} 断线，由 AI 托管 🤖`,
      );
      this.broadcastViews();
      this.broadcastLobby();
      this.schedule();
    } else {
      this.broadcastLobby();
    }
    this.maybeClose();
  }

  /** 主动离开：大厅直接移除；对局中转为托管 */
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
    // 对局中：托管
    s.connected = false;
    s.socketId = null;
    s.autoPlay = true;
    this.transferHostIfNeeded(playerId);
    this.game?.log(`${s.name} 离开对局，由 AI 托管 🤖`);
    this.broadcastViews();
    this.broadcastLobby();
    this.schedule();
    this.maybeClose();
  }

  /** 房主离场时把房主身份交给其他在线真人 */
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
    this.clearTimers();
    this.onEmpty(this.code);
  }
}
