/**
 * 《鳄龙咆哮》realtime 联机 driver：
 * - 复用 Socket.IO 大厅生命周期（create/join/rejoin/listRooms/start）；
 * - 对局期发送 `rtInput { input }`，接收 20Hz `rtSnapshot`；
 * - 与 useRemoteGame 并存，不改动出包魔法师的连接代码。
 */
import { useCallback, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  LobbyInfo,
  RoomListItem,
  ServerToClientEvents,
} from '@tm/rules';
import type { RealtimeInputAction, Snapshot } from '@tm/game-corcodragon-fight';

const TOKEN_KEY = 'tm-room-tokens';

interface SavedRoom {
  playerId: string;
  name: string;
  ts: number;
}

function loadTokens(): Record<string, SavedRoom> {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedRoom>) : {};
  } catch {
    return {};
  }
}

function saveToken(code: string, playerId: string, name: string): void {
  try {
    const tokens = loadTokens();
    tokens[code] = { playerId, name, ts: Date.now() };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    /* ignore */
  }
}

function removeToken(code: string): void {
  try {
    const tokens = loadTokens();
    delete tokens[code];
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    /* ignore */
  }
}

function lastSavedRoom(): { code: string; token: string; name: string } | null {
  const tokens = loadTokens();
  let best: { code: string; token: string; name: string; ts: number } | null = null;
  for (const [code, t] of Object.entries(tokens)) {
    if (!best || t.ts > best.ts) best = { code, token: t.playerId, name: t.name, ts: t.ts };
  }
  return best ? { code: best.code, token: best.token, name: best.name } : null;
}

export type RealtimeStage = 'disconnected' | 'lobby' | 'playing';

export interface RealtimeApi {
  stage: RealtimeStage;
  lobby: LobbyInfo | null;
  snapshot: Snapshot | null;
  error: string | null;
  myId: string | null;
  roomList: RoomListItem[] | null;
  create: (name: string, botCount: number, password: string | undefined, config: Record<string, unknown>) => void;
  join: (code: string, name: string, password?: string) => void;
  rejoin: () => void;
  listRooms: () => void;
  setBots: (count: number) => void;
  setPassword: (password: string) => void;
  start: () => void;
  sendInput: (input: RealtimeInputAction) => void;
  leave: () => void;
}

export function useRealtimeGame(serverUrl: string): RealtimeApi {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [stage, setStage] = useState<RealtimeStage>('disconnected');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [roomList, setRoomList] = useState<RoomListItem[] | null>(null);

  const ensure = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const s = io(serverUrl.trim() || undefined, { transports: ['websocket', 'polling'] });
    s.on('lobby', (info) => {
      setLobby(info);
      setStage((prev) => (prev === 'playing' ? 'playing' : 'lobby'));
    });
    s.on('rtSnapshot', (snap) => {
      setSnapshot(snap as Snapshot);
      setStage('playing');
    });
    s.on('error', (m) => setError(m));
    s.on('connect', () => setError(null));
    s.on('disconnect', () => setError('⚠️ 与服务器的连接断开'));
    socketRef.current = s;
    return s;
  }, [serverUrl]);

  const create = useCallback(
    (name: string, botCount: number, password: string | undefined, config: Record<string, unknown>) => {
      setError(null);
      const s = ensure();
      s.emit(
        'createRoom',
        { name, botCount, password, gameId: 'corcodragon-fight', config },
        (res: AckResult) => {
          if (!res.ok) {
            setError(res.error);
            return;
          }
          saveToken(res.code, res.playerId, name);
          setMyId(res.playerId);
        },
      );
    },
    [ensure],
  );

  const join = useCallback(
    (code: string, name: string, password?: string) => {
      setError(null);
      const s = ensure();
      s.emit('joinRoom', { code: code.trim().toUpperCase(), name, password }, (res: AckResult) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        saveToken(res.code, res.playerId, name);
        setMyId(res.playerId);
      });
    },
    [ensure],
  );

  const rejoin = useCallback(() => {
    const saved = lastSavedRoom();
    if (!saved) return;
    setError(null);
    const s = ensure();
    s.emit('joinRoom', { code: saved.code, name: saved.name, token: saved.token }, (res: AckResult) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      saveToken(res.code, res.playerId, saved.name);
      setMyId(res.playerId);
    });
  }, [ensure]);

  const listRooms = useCallback(() => {
    const s = ensure();
    s.emit('listRooms', (res) => {
      setRoomList(res.rooms ?? []);
    });
  }, [ensure]);

  const setBots = useCallback((count: number) => {
    socketRef.current?.emit('setBots', { count });
  }, []);

  const setPassword = useCallback((password: string) => {
    socketRef.current?.emit('setPassword', { password });
  }, []);

  const start = useCallback(() => {
    socketRef.current?.emit('startGame');
  }, []);

  const sendInput = useCallback((input: RealtimeInputAction) => {
    socketRef.current?.emit('rtInput', { input });
  }, []);

  const leave = useCallback(() => {
    const code = lobby?.code;
    socketRef.current?.emit('leaveRoom');
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (code) removeToken(code);
    setStage('disconnected');
    setLobby(null);
    setSnapshot(null);
    setMyId(null);
    setError(null);
    setRoomList(null);
  }, [lobby?.code]);

  return {
    stage,
    lobby,
    snapshot,
    error,
    myId,
    roomList,
    create,
    join,
    rejoin,
    listRooms,
    setBots,
    setPassword,
    start,
    sendInput,
    leave,
  };
}
