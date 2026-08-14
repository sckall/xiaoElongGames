import { useCallback, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  LobbyInfo,
  Magic,
  PlayerView,
  ServerToClientEvents,
} from '@tm/rules';

const TOKEN_KEY = 'tm-room-token';

interface SavedRoom {
  code: string;
  playerId: string;
  name: string;
}

export function savedRoom(): SavedRoom | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as SavedRoom) : null;
  } catch {
    return null;
  }
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
  start: () => void;
  declare: (magic: Magic) => void;
  endTurn: () => void;
  leave: () => void;
}

export function useRemoteGame(): RemoteApi {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [stage, setStage] = useState<RemoteStage>('disconnected');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const ensure = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const s = io({ transports: ['websocket', 'polling'] });
    s.on('lobby', (info) => {
      setLobby(info);
      setStage('lobby');
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
  }, []);

  const saveToken = useCallback((code: string, playerId: string, name: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ code, playerId, name }));
    } catch {
      /* ignore */
    }
  }, []);

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
    [ensure, saveToken],
  );

  const join = useCallback(
    (code: string, name: string) => {
      setError(null);
      const s = ensure();
      const saved = savedRoom();
      const token = saved && saved.code === code.toUpperCase() ? saved.playerId : undefined;
      s.emit('joinRoom', { code, name, token }, (res: AckResult) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        saveToken(res.code, res.playerId, name);
        setMyId(res.playerId);
      });
    },
    [ensure, saveToken],
  );

  const rejoin = useCallback(() => {
    const saved = savedRoom();
    if (!saved) return;
    join(saved.code, saved.name);
  }, [join]);

  const setBots = useCallback(
    (count: number) => {
      socketRef.current?.emit('setBots', { count });
    },
    [],
  );

  const start = useCallback(() => {
    socketRef.current?.emit('startGame');
  }, []);

  const declare = useCallback((magic: Magic) => {
    socketRef.current?.emit('declareSpell', { magic });
  }, []);

  const endTurn = useCallback(() => {
    socketRef.current?.emit('endTurn');
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.emit('leaveRoom');
    socketRef.current?.disconnect();
    socketRef.current = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setStage('disconnected');
    setLobby(null);
    setView(null);
    setMyId(null);
    setError(null);
  }, []);

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
    start,
    declare,
    endTurn,
    leave,
  };
}
