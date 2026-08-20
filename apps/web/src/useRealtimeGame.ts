/**
 * 《鳄龙咆哮》realtime 联机 driver：
 * - 复用 Socket.IO 大厅生命周期（create/join/rejoin/listRooms/start）；
 * - 对局期发送 `rtInput { input }`，接收 20/30/60Hz（默认 30Hz）`rtSnapshot`；
 * - 与 useRemoteGame 并存，不改动出包魔法师的连接代码。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  LobbyInfo,
  RoomListItem,
  ServerToClientEvents,
} from '@tm/rules';
import { getUserId } from './storage/userId';
import type { RealtimeInputAction, Snapshot } from '@tm/game-corcodragon-fight';

const TOKEN_KEY = 'tm-room-tokens';
/**
 * React 状态（HUD）按该间隔节流渲染；渲染循环始终经 snapshotRef 读最新快照。
 * 带事件或阶段变化的快照立即渲染，保证击杀/命中反馈零感知延迟。
 */
const SNAPSHOT_RENDER_INTERVAL_MS = 50;

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

export interface NetworkStats {
  /** 估算单程延迟（RTT/2，毫秒） */
  pingMs: number;
  /** 已发送但服务端尚未回执的输入数 */
  pendingInputs: number;
}

export interface RealtimeApi {
  stage: RealtimeStage;
  lobby: LobbyInfo | null;
  snapshot: Snapshot | null;
  /** 每帧可读的最新快照（不经过节流的 React 渲染管线） */
  snapshotRef: { current: Snapshot | null };
  error: string | null;
  myId: string | null;
  roomList: RoomListItem[] | null;
  stats: NetworkStats;
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
  const seqRef = useRef(0);
  const pendingRef = useRef(new Map<number, RealtimeInputAction>());
  const pingRef = useRef(0);
  const snapshotRef = useRef<Snapshot | null>(null);
  const lastRenderedSnapRef = useRef<Snapshot | null>(null);
  const lastSnapshotRenderAtRef = useRef(0);
  const [stage, setStage] = useState<RealtimeStage>('disconnected');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [roomList, setRoomList] = useState<RoomListItem[] | null>(null);
  const [stats, setStats] = useState<NetworkStats>({ pingMs: 0, pendingInputs: 0 });

  // 延迟探测：每 2 秒一次 rtPing，RTT/2 作为单程延迟估计
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = socketRef.current;
      if (!s?.connected) return;
      const sentAt = performance.now();
      s.emit('rtPing', { sentAt }, () => {
        pingRef.current = Math.max(0, Math.round((performance.now() - sentAt) / 2));
        setStats((prev) => ({ ...prev, pingMs: pingRef.current }));
      });
    }, 2000);
    return () => window.clearInterval(t);
  }, []);

  const ensure = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const s = io(serverUrl.trim() || undefined, { transports: ['websocket', 'polling'] });
    s.on('lobby', (info) => {
      setLobby(info);
      setStage((prev) => (prev === 'playing' ? 'playing' : 'lobby'));
    });
    s.on('rtSnapshot', (snap) => {
      const view = snap as Snapshot;
      snapshotRef.current = view;
      const me = view.players.find((p) => p.id === view.youId);
      const ack = me?.lastInputSeq ?? -1;
      for (const key of pendingRef.current.keys()) {
        if (key <= ack) pendingRef.current.delete(key);
      }
      // 高频快照不再每次都 setState：渲染循环经 snapshotRef 读最新状态，
      // HUD 按 ~20Hz 节流渲染；有事件/阶段切换时立即渲染保证反馈及时。
      const last = lastRenderedSnapRef.current;
      const phaseChanged = !last || last.phase !== view.phase;
      const hasEvents = (view.events?.length ?? 0) > 0;
      const due = performance.now() - lastSnapshotRenderAtRef.current >= SNAPSHOT_RENDER_INTERVAL_MS;
      if (phaseChanged || hasEvents || due) {
        lastRenderedSnapRef.current = view;
        lastSnapshotRenderAtRef.current = performance.now();
        setStats((prev) => ({ ...prev, pendingInputs: pendingRef.current.size }));
        setSnapshot(view);
        setStage('playing');
      }
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
        {
          name,
          botCount,
          password,
          gameId: 'corcodragon-fight',
          config,
          userId: getUserId(),
        },
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
      s.emit(
        'joinRoom',
        { code: code.trim().toUpperCase(), name, password, userId: getUserId() },
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

  const rejoin = useCallback(() => {
    const saved = lastSavedRoom();
    if (!saved) return;
    setError(null);
    const s = ensure();
    s.emit(
      'joinRoom',
      { code: saved.code, name: saved.name, token: saved.token, userId: getUserId() },
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
    const s = socketRef.current;
    if (!s) return;
    const seq = seqRef.current++;
    pendingRef.current.set(seq, input);
    setStats((prev) => ({ ...prev, pendingInputs: pendingRef.current.size }));
    s.emit('rtInput', { input, seq });
  }, []);

  const leave = useCallback(() => {
    const code = lobby?.code;
    socketRef.current?.emit('leaveRoom');
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (code) removeToken(code);
    seqRef.current = 0;
    pendingRef.current.clear();
    pingRef.current = 0;
    snapshotRef.current = null;
    lastRenderedSnapRef.current = null;
    lastSnapshotRenderAtRef.current = 0;
    setStage('disconnected');
    setLobby(null);
    setSnapshot(null);
    setMyId(null);
    setError(null);
    setRoomList(null);
    setStats({ pingMs: 0, pendingInputs: 0 });
  }, [lobby?.code]);

  return {
    stage,
    lobby,
    snapshot,
    snapshotRef,
    error,
    myId,
    roomList,
    stats,
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
