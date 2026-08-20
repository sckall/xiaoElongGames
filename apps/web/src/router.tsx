/**
 * 应用路由 + 全局状态 Provider
 * ---------------------------------------------------------------
 * 使用 react-router-dom v6 + HashRouter，URL 形如：
 *   /#/                 登录 / 昵称
 *   /#/hall             游戏大厅
 *   /#/game/:gameId     某个游戏的详情页
 *   /#/game/:gameId/local   本地对战
 *   /#/game/:gameId/online  联机对战
 *
 * 为什么用 HashRouter：部署在 GitHub Pages（纯静态托管），
 * 子路径刷新不依赖服务器 SPA fallback，零配置即可工作。
 *
 * 全局状态（myName / playerCount / settings / fightConfig / fightPrefs / sessionKey）
 * 全部提升到 GameStateContext，由 Provider 统一管理并按需持久化到 localStorage。
 * 各子屏（GameLobbyScreen / GameDetailScreen / *LocalScreen / *OnlineScreen …）
 * 的 props 签名保持不变，由下方 Route 组件把 Context 状态 + navigate 包装成对应 props 注入。
 */

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import CloudGameEntryScreen from './CloudGameEntryScreen';
import GameLobbyScreen from './GameLobbyScreen';
import GameDetailScreen from './GameDetailScreen';
import LocalGameScreen from './LocalGameScreen';
import OnlineScreen from './OnlineScreen';
import { DEFAULT_SETTINGS, type GameSettings } from './GameSettings';
import { t } from './i18n';
import {
  CorcodragonDetailScreen,
  CorcodragonLocalScreen,
} from '@tm/game-corcodragon-fire/GameUI';
import type { FightConfig, FightPrefs } from '@tm/game-corcodragon-fight/GameUI';

// 鳄龙咆哮含 Three.js（约 600KB），按需分包加载，避免拖慢大厅首屏
const CorcodragonFightDetailScreen = lazy(() =>
  import('@tm/game-corcodragon-fight/GameUI').then((m) => ({
    default: m.CorcodragonFightDetailScreen,
  })),
);
const CorcodragonFightLocalScreen = lazy(() =>
  import('@tm/game-corcodragon-fight/GameUI').then((m) => ({
    default: m.CorcodragonFightLocalScreen,
  })),
);
const CorcodragonFightOnlineScreen = lazy(() => import('./CorcodragonFightOnlineScreen'));

const Loading = () => (
  <div className="page">
    <div className="panel">
      <p className="tagline">{t('home.loading')}</p>
    </div>
  </div>
);

// ============================================================================
// localStorage 工具
// ============================================================================

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const LS = {
  playerName: 'tm-player-name',
  playerCount: 'tm-player-count',
  settings: 'tm-settings',
  fightSettings: 'tm-fight-settings',
  fightConfig: 'tm-fight-config',
} as const;

// ============================================================================
// 全局状态 Context
// ============================================================================

interface GameState {
  myName: string;
  setMyName: (n: string) => void;
  playerCount: number;
  setPlayerCount: (n: number) => void;
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
  fightConfig: FightConfig;
  setFightConfig: (c: FightConfig) => void;
  fightPrefs: FightPrefs;
  updateFightPrefs: (p: Partial<FightPrefs>) => void;
  /** 重新挂载对战组件（用于「再来一局」） */
  bumpSession: () => void;
  /** 登出：清掉昵称并跳到登录页 */
  signOut: () => void;
}

const GameStateContext = createContext<GameState | null>(null);

export function useGameState(): GameState {
  const ctx = useContext(GameStateContext);
  if (!ctx) throw new Error('useGameState must be used inside <GameStateProvider>');
  return ctx;
}

export function GameStateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const [myName, setMyNameState] = useState<string>(() => {
    try {
      return localStorage.getItem(LS.playerName) || '';
    } catch {
      return '';
    }
  });

  const [playerCount, setPlayerCountState] = useState<number>(() => loadJson<number>(LS.playerCount, 4));

  const [settings, setSettings] = useState<GameSettings>(() =>
    loadJson<GameSettings>(LS.settings, { ...DEFAULT_SETTINGS }),
  );

  const [fightConfig, setFightConfigState] = useState<FightConfig>(() =>
    loadJson<FightConfig>(LS.fightConfig, {
      mode: 'ffa',
      scoreLimit: 15,
      tickHz: 30,
      respawnMs: 15_000,
      aiStyle: 'combat',
      aiLevel: 'normal',
    }),
  );

  const [fightPrefs, setFightPrefs] = useState<FightPrefs>(() =>
    loadJson<FightPrefs>(LS.fightSettings, { sound: true, fx: true }),
  );

  const [, setSessionKey] = useState(0);
  const bumpSession = useCallback(() => setSessionKey((k) => k + 1), []);

  const setMyName = useCallback((n: string) => {
    setMyNameState(n);
    try {
      localStorage.setItem(LS.playerName, n);
    } catch {
      /* ignore */
    }
  }, []);

  const setPlayerCount = useCallback((n: number) => {
    setPlayerCountState(n);
    saveJson(LS.playerCount, n);
  }, []);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveJson(LS.settings, next);
      return next;
    });
  }, []);

  const setFightConfig = useCallback((c: FightConfig) => {
    setFightConfigState(c);
    saveJson(LS.fightConfig, c);
  }, []);

  const updateFightPrefs = useCallback((patch: Partial<FightPrefs>) => {
    setFightPrefs((p) => {
      const next = { ...p, ...patch };
      saveJson(LS.fightSettings, next);
      return next;
    });
  }, []);

  const signOut = useCallback(() => {
    setMyNameState('');
    try {
      localStorage.removeItem(LS.playerName);
    } catch {
      /* ignore */
    }
    navigate('/');
  }, [navigate]);

  const value = useMemo<GameState>(
    () => ({
      myName,
      setMyName,
      playerCount,
      setPlayerCount,
      settings,
      updateSettings,
      fightConfig,
      setFightConfig,
      fightPrefs,
      updateFightPrefs,
      bumpSession,
      signOut,
    }),
    [
      myName,
      setMyName,
      playerCount,
      setPlayerCount,
      settings,
      updateSettings,
      fightConfig,
      setFightConfig,
      fightPrefs,
      updateFightPrefs,
      bumpSession,
      signOut,
    ],
  );

  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>;
}

// ============================================================================
// 路由守卫：未登录访问受保护页面 → 重定向到 /
// ============================================================================

function RequireName({ children }: { children: ReactNode }) {
  const { myName } = useGameState();
  const location = useLocation();
  if (!myName) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

// ============================================================================
// 路由组件
// ============================================================================

/** 登录 / 昵称页 */
function LoginRoute() {
  const { myName, setMyName } = useGameState();
  const navigate = useNavigate();

  // 已有昵称直接跳大厅（replace：避免回退又到登录页）
  useEffect(() => {
    if (myName) navigate('/hall', { replace: true });
  }, [myName, navigate]);

  return (
    <CloudGameEntryScreen
      initialName={myName || '旅行者'}
      onEnter={(name) => {
        setMyName(name.trim() || '旅行者');
        navigate('/hall');
      }}
    />
  );
}

/** 游戏大厅 */
function HallRoute() {
  const { myName } = useGameState();
  const navigate = useNavigate();

  return (
    <RequireName>
      <GameLobbyScreen
        playerName={myName}
        onEnter={(gameId) => navigate(`/game/${gameId}`)}
        onBack={() => navigate('/')}
        onStartWorld={() => {
          window.alert('开放世界场景尚未实现。\n（占位入口，预留接 Three.js 第三人称世界）');
        }}
      />
    </RequireName>
  );
}

/** 通用游戏详情（出包魔法师） */
function TroubleMagicianDetailRoute() {
  const { playerCount, setPlayerCount, settings, updateSettings } = useGameState();
  const navigate = useNavigate();

  return (
    <RequireName>
      <GameDetailScreen
        playerCount={playerCount}
        onPlayerCountChange={setPlayerCount}
        aiSpeed={settings.aiSpeed}
        onAiSpeedChange={(ms) => updateSettings({ aiSpeed: ms })}
        settings={settings}
        onUpdateSettings={updateSettings}
        onPlayLocal={() => navigate('/game/trouble-magician/local')}
        onPlayOnline={() => navigate('/game/trouble-magician/online')}
        onBack={() => navigate('/hall')}
      />
    </RequireName>
  );
}

/** 鳄龙咆哮（3D 射击）详情 */
function FightDetailRoute() {
  const { playerCount, setPlayerCount, fightPrefs, updateFightPrefs, setFightConfig } = useGameState();
  const navigate = useNavigate();

  return (
    <RequireName>
      <Suspense fallback={<Loading />}>
        <CorcodragonFightDetailScreen
          playerCount={playerCount}
          onPlayerCountChange={setPlayerCount}
          prefs={fightPrefs}
          onToggleSound={() => updateFightPrefs({ sound: !fightPrefs.sound })}
          onToggleFx={() => updateFightPrefs({ fx: !fightPrefs.fx })}
          onPlayLocal={(config) => {
            setFightConfig(config);
            navigate('/game/corcodragon-fight/local');
          }}
          onPlayOnline={(config) => {
            setFightConfig(config);
            navigate('/game/corcodragon-fight/online');
          }}
          onlineReady={true}
          onBack={() => navigate('/hall')}
        />
      </Suspense>
    </RequireName>
  );
}

/** 鳄龙战场（回合制）详情 */
function FireDetailRoute() {
  const { playerCount, setPlayerCount, settings, updateSettings } = useGameState();
  const navigate = useNavigate();

  return (
    <RequireName>
      <CorcodragonDetailScreen
        playerCount={playerCount}
        onPlayerCountChange={setPlayerCount}
        aiSpeed={settings.aiSpeed}
        onAiSpeedChange={(ms) => updateSettings({ aiSpeed: ms })}
        onPlayLocal={() => navigate('/game/corcodragon-fire/local')}
        onBack={() => navigate('/hall')}
      />
    </RequireName>
  );
}

/** 详情路由分发：/game/:gameId */
function GameDetailRoute() {
  const { gameId } = useParams();
  if (gameId === 'corcodragon-fight') return <FightDetailRoute />;
  if (gameId === 'corcodragon-fire') return <FireDetailRoute />;
  // 兜底：trouble-magician / 未知 gameId 都走通用详情
  return <TroubleMagicianDetailRoute />;
}

/** 本地对战路由分发：/game/:gameId/local */
function LocalRoute() {
  const { gameId } = useParams();
  const {
    myName,
    playerCount,
    settings,
    updateSettings,
    bumpSession,
    fightConfig,
    fightPrefs,
  } = useGameState();
  const navigate = useNavigate();

  if (gameId === 'corcodragon-fight') {
    return (
      <RequireName>
        <Suspense fallback={<Loading />}>
          <CorcodragonFightLocalScreen
            key={`fight-local-${playerCount}-${fightConfig.mode}-${fightConfig.scoreLimit}`}
            playerCount={playerCount}
            myName={myName}
            config={fightConfig}
            sound={fightPrefs.sound}
            fx={fightPrefs.fx}
            onExit={() => navigate('/game/corcodragon-fight')}
          />
        </Suspense>
      </RequireName>
    );
  }
  if (gameId === 'corcodragon-fire') {
    return (
      <RequireName>
        <CorcodragonLocalScreen
          key={`fire-local-${playerCount}`}
          playerCount={playerCount}
          myName={myName}
          aiSpeed={settings.aiSpeed}
          settings={settings}
          onExit={() => navigate('/game/corcodragon-fire')}
          onRestart={bumpSession}
        />
      </RequireName>
    );
  }
  // trouble-magician
  return (
    <RequireName>
      <LocalGameScreen
        key={`tm-local-${playerCount}`}
        playerCount={playerCount}
        myName={myName}
        settings={settings}
        onExit={() => navigate('/game/trouble-magician')}
        onRestart={bumpSession}
        onToggleSound={() => updateSettings({ sound: !settings.sound })}
        onToggleFx={() => updateSettings({ fx: !settings.fx })}
        onToggleLog={() => updateSettings({ showLog: !settings.showLog })}
      />
    </RequireName>
  );
}

/** 联机对战路由分发：/game/:gameId/online */
function OnlineRoute() {
  const { gameId } = useParams();
  const { myName, playerCount, settings, updateSettings, fightConfig, fightPrefs } = useGameState();
  const navigate = useNavigate();

  if (gameId === 'corcodragon-fight') {
    return (
      <RequireName>
        <Suspense fallback={<Loading />}>
          <CorcodragonFightOnlineScreen
            key={`fight-online-${playerCount}-${fightConfig.mode}-${fightConfig.scoreLimit}`}
            settings={settings}
            prefs={fightPrefs}
            defaultName={myName}
            config={fightConfig}
            onExit={() => navigate('/game/corcodragon-fight')}
            onServerUrlChange={(url) => updateSettings({ serverUrl: url.trim() })}
          />
        </Suspense>
      </RequireName>
    );
  }
  return (
    <RequireName>
      <OnlineScreen
        key={`tm-online-${settings.serverUrl}`}
        settings={settings}
        defaultName={myName}
        onExit={() => navigate(`/game/${gameId}`)}
        onToggleSound={() => updateSettings({ sound: !settings.sound })}
        onToggleFx={() => updateSettings({ fx: !settings.fx })}
        onToggleLog={() => updateSettings({ showLog: !settings.showLog })}
        onServerUrlChange={(url) => updateSettings({ serverUrl: url.trim() })}
      />
    </RequireName>
  );
}

// ============================================================================
// 路由根
// ============================================================================

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginRoute />} />
      <Route path="/hall" element={<HallRoute />} />
      <Route path="/game/:gameId" element={<GameDetailRoute />} />
      <Route path="/game/:gameId/local" element={<LocalRoute />} />
      <Route path="/game/:gameId/online" element={<OnlineRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
