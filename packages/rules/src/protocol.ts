/**
 * 联机版 Socket.IO 通信协议（客户端与服务端共用）。
 */
import type { Magic, PlayerView } from './types';

export const MAX_NAME_LEN = 12;
export const ROOM_CODE_LEN = 4;

export interface RoomPlayerInfo {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface LobbyInfo {
  code: string;
  hostId: string;
  status: 'lobby' | 'playing';
  players: RoomPlayerInfo[];
  botCount: number;
  humanCount: number;
}

export type Ack<T> = (res: T) => void;

export interface CreateRoomPayload {
  name: string;
  botCount: number;
}

export interface JoinRoomPayload {
  code: string;
  name: string;
  /** 断线重连凭据（localStorage 保存的 playerId） */
  token?: string;
}

export type AckResult =
  | { ok: true; code: string; playerId: string; rejoin?: boolean }
  | { ok: false; error: string };

export interface ClientToServerEvents {
  createRoom: (payload: CreateRoomPayload, cb: Ack<AckResult>) => void;
  joinRoom: (payload: JoinRoomPayload, cb: Ack<AckResult>) => void;
  leaveRoom: () => void;
  setBots: (payload: { count: number }) => void;
  startGame: () => void;
  declareSpell: (payload: { magic: Magic }) => void;
  endTurn: () => void;
}

export interface ServerToClientEvents {
  lobby: (info: LobbyInfo) => void;
  state: (view: PlayerView) => void;
  error: (message: string) => void;
}
