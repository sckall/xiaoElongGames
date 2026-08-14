import { useCallback, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  LobbyInfo,
  Magic,
  PlayerView,
  RoomSettings,
  ServerToClientEvents,
} from '@tm/rules';

/**
 * 断线重连凭据：按房间码存多份，避免同机多窗口互相覆盖。
 * 普通"加入房间"永远不带 token（新玩家）；只有显式"重新加入"才使用。
 */
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

/** 最近一次进入过的房间（供"重新加入上次的房间"） */
export function lastSavedRoom(): { code: string; token: string; name: string } | null {
  const tokens = loadTokens();
  let best: { code: string; token: string; name: string; ts: number } | null = null;
  for (const [code, t] of Object.entries(tokens)) {
    if (!best || t.ts > best.ts) best = { code, token: t.playerId, name: t.name, ts: t.ts };
  }
  return best ? { code: best.code, token: best.token, name: best.name } : null;
}

export type RemoteStage = 'disconnected' | 'lobby' | 'playing';

export interface RemoteApi {
  stage: RemoteStage;
  lobby: LobbyInfo | null;
  view: PlayerView | null;
  error: string | null;
  myId: string | null;
  create: (name: string, botCount: number) => void;
  join: (code: string, name: string) => void;
  rejoin: () => void;
  setBots: (count: number) => void;
  updateSettings: (patch: Partial<RoomSettings>) => void;
  start: () => void;
  /** 房主开始下一轮 */
  advanceRound: () => void;
  declare: (magic: Magic) => void;
  endTurn: () => void;
  leave: () => void;
}

export function useRemoteGame(serverUrl: string): RemoteApi {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [stage, setStage] = useState<RemoteStage>('disconnected');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const ensure = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    // 空地址 = 同源自动（开发走 vite 代理，生产同端口），填写则直连
    const s = io(serverUrl.trim() || undefined, { transports: ['websocket', 'polling'] });
    s.on('lobby', (info) => {
      setLobby(info);
      // 对局进行中的 lobby 广播（断线/托管状态同步）不能把界面拉回大厅
      setStage((prev) => (prev === 'playing' ? 'playing' : 'lobby'));
    });
    s.on('state', (v) => {
      setView(v);
      setStage('playing');
    });
    s.on('error', (m) => setError(m));
    s.on('connect', () => setError(null));
    s.on('disconnect', () => setError('⚠️ 与服务器的连接断开'));
    socketRef.current = s;
    return s;
  }, [serverUrl]);

  const create = useCallback(
    (name: string, botCount: number) => {
      setError(null);
      const s = ensure();
      s.emit('createRoom', { name, botCount }, (res: AckResult) => {
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

  /** 普通加入：不带 token（永远是新玩家） */
  const join = useCallback(
    (code: string, name: string) => {
      setError(null);
      const s = ensure();
      s.emit('joinRoom', { code: code.trim().toUpperCase(), name }, (res: AckResult) => {
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

  /** 显式重连：带 token 恢复原座位 */
  const rejoin = useCallback(() => {
    const saved = lastSavedRoom();
    if (!saved) return;
    setError(null);
    const s = ensure();
    s.emit(
      'joinRoom',
      { code: saved.code, name: saved.name, token: saved.token },
      (res: AckResult) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        saveToken(res.code, res.playerId, saved.name);
        setMyId(res.playerId);
      },
    );
  }, [ensure]);

  const setBots = useCallback((count: number) => {
    socketRef.current?.emit('setBots', { count });
  }, []);

  const updateSettings = useCallback((patch: Partial<RoomSettings>) => {
    socketRef.current?.emit('updateSettings', { settings: patch });
  }, []);

  const start = useCallback(() => {
    socketRef.current?.emit('startGame');
  }, []);

  /** 房主开始下一轮 */
  const advanceRound = useCallback(() => {
    socketRef.current?.emit('nextRound');
  }, []);

  const declare = useCallback((magic: Magic) => {
    socketRef.current?.emit('declareSpell', { magic });
  }, []);

  const endTurn = useCallback(() => {
    socketRef.current?.emit('endTurn');
  }, []);

  const leave = useCallback(() => {
    const code = lobby?.code;
    socketRef.current?.emit('leaveRoom');
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (code) removeToken(code);
    setStage('disconnected');
    setLobby(null);
    setView(null);
    setMyId(null);
    setError(null);
  }, [lobby?.code]);

  return {
    stage,
    lobby,
    view,
    error,
    myId,
    create,
    join,
    rejoin,
    setBots,
    updateSettings,
    start,
    advanceRound,
    declare,
    endTurn,
    leave,
  };
}
