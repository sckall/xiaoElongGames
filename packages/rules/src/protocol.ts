/**
 * 联机版 Socket.IO 通信协议（客户端与服务端共用）。
 */
import type { Magic, PlayerView } from './types';

export const MAX_NAME_LEN = 12;
export const ROOM_CODE_LEN = 4;
export const MAX_PASSWORD_LEN = 16;
/** 游戏 ID（未来多游戏时按游戏注册） */
export const GAME_ID = 'trouble-magician';

/** 房间列表项（公开信息） */
export interface RoomListItem {
  code: string;
  gameId: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  status: 'lobby' | 'playing';
}

/** 断线托管策略 */
export type AutopilotMode = 'instant' | 'wait15s' | 'wait60s';

export const AUTOPILOT_DELAYS: Record<AutopilotMode, number> = {
  instant: 0,
  wait15s: 15_000,
  wait60s: 60_000,
};

export const AUTOPILOT_LABELS: Record<AutopilotMode, string> = {
  instant: '立即托管',
  wait15s: '等待 15 秒',
  wait60s: '等待 60 秒',
};

export interface RoomSettings {
  /** 断线多久后由 AI 托管（-1 = 永不托管，等房主手动处理/真人回来） */
  autopilot: AutopilotMode;
  /** AI 行动节奏（毫秒） */
  aiSpeed: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  autopilot: 'wait15s',
  aiSpeed: 1200,
};

export interface RoomPlayerInfo {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  /** 座位当前是否由 AI 托管（断线/离开触发） */
  autopilot: boolean;
}

export interface LobbyInfo {
  code: string;
  hostId: string;
  status: 'lobby' | 'playing';
  players: RoomPlayerInfo[];
  botCount: number;
  humanCount: number;
  settings: RoomSettings;
  /** 房间是否设有密码 */
  hasPassword: boolean;
  /** 游戏 id（realtime 房间必填；旧回合制房间可省略，默认 trouble-magician） */
  gameId?: string;
  /** 游戏自定对局配置（realtime 房间回显给大厅/对局 UI） */
  config?: Record<string, unknown>;
}

export type Ack<T> = (res: T) => void;

export interface CreateRoomPayload {
  name: string;
  botCount: number;
  settings?: Partial<RoomSettings>;
  /** 可选房间密码（空 = 无密码） */
  password?: string;
  /** 游戏 id（缺省 = trouble-magician，兼容旧客户端） */
  gameId?: string;
  /** 游戏自定对局配置（由游戏引擎校验，平台不透传语义） */
  config?: Record<string, unknown>;
}

export interface JoinRoomPayload {
  code: string;
  name: string;
  /** 仅「重新加入上次房间」时携带 */
  token?: string;
  /** 房间密码（有锁房间必填） */
  password?: string;
}

export type AckResult =
  | { ok: true; code: string; playerId: string; rejoin?: boolean }
  | { ok: false; error: string };

export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload, cb: Ack<AckResult>) => void;
  joinRoom: (payload: JoinRoomPayload, cb: Ack<AckResult>) => void;
  leaveRoom: () => void;
  setBots: (payload: { count: number }) => void;
  updateSettings: (payload: { settings: Partial<RoomSettings> }) => void;
  /** 房主设置/清除房间密码（空串清除） */
  setPassword: (payload: { password: string }) => void;
  /** 拉取公开房间列表 */
  listRooms: (cb: Ack<{ rooms: RoomListItem[] }>) => void;
  startGame: () => void;
  /** 本轮结算后由房主触发开始下一轮 */
  nextRound: () => void;
  declareSpell: (payload: { magic: Magic }) => void;
  endTurn: () => void;
  /** realtime 游戏输入流（载荷由游戏引擎白名单校验） */
  rtInput: (payload: { input: unknown }) => void;
}

export interface ServerToClientEvents {
  lobby: (info: LobbyInfo) => void;
  state: (view: PlayerView) => void;
  /** realtime 游戏按玩家视角快照（20Hz） */
  rtSnapshot: (snapshot: unknown) => void;
  error: (message: string) => void;
}
