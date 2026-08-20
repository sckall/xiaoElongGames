import { lazy, Suspense, useState } from 'react';
import LocalGameScreen from './LocalGameScreen';
import OnlineScreen from './OnlineScreen';
import GameLobbyScreen from './GameLobbyScreen';
import CloudGameEntryScreen from './CloudGameEntryScreen';
import GameDetailScreen from './GameDetailScreen';
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

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem('tm-settings');
    if (raw) {
      const s = JSON.parse(raw) as Partial<GameSettings>;
      return {
        fx: s.fx !== false,
        sound: s.sound !== false,
        aiSpeed: typeof s.aiSpeed === 'number' ? s.aiSpeed : DEFAULT_SETTINGS.aiSpeed,
        serverUrl: typeof s.serverUrl === 'string' ? s.serverUrl : '',
        showLog: s.showLog === true,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

/** 鳄龙咆哮专属偏好：与出包魔法师 tm-settings 分离存储 */
function loadFightPrefs(): FightPrefs {
  try {
    const raw = localStorage.getItem('tm-fight-settings');
    if (raw) {
      const s = JSON.parse(raw) as Partial<FightPrefs>;
      return { sound: s.sound !== false, fx: s.fx !== false };
    }
  } catch {
    /* ignore */
  }
  return { sound: true, fx: true };
}

type Screen = 'setup' | 'hall' | 'game' | 'local' | 'online';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [playerCount, setPlayerCount] = useState(4);
  const [myName, setMyName] = useState('你');
  const [sessionKey, setSessionKey] = useState(0);
  const [selectedGameId, setSelectedGameId] = useState('trouble-magician');
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [fightConfig, setFightConfig] = useState<FightConfig>({
    mode: 'ffa',
    scoreLimit: 15,
    tickHz: 30,
    respawnMs: 15_000,
    aiStyle: 'combat',
    aiLevel: 'normal',
  });
  const [fightPrefs, setFightPrefs] = useState<FightPrefs>(loadFightPrefs);

  const updateSettings = (patch: Partial<GameSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem('tm-settings', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const updateFightPrefs = (patch: Partial<FightPrefs>) => {
    setFightPrefs((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem('tm-fight-settings', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (screen === 'hall') {
    return (
      <GameLobbyScreen
        playerName={myName}
        onEnter={(gameId) => {
          setSelectedGameId(gameId);
          setScreen('game');
        }}
        onBack={() => setScreen('setup')}
        onStartWorld={() => {
          // 占位：未来接第三人称开放世界场景（Three.js）
          // 这里先用 alert 演示，后续替换成 setScreen('world')
          window.alert('开放世界场景尚未实现。\\n（占位入口，预留接 Three.js 第三人称世界）');
        }}
      />
    );
  }

  if (screen === 'game') {
    if (selectedGameId === 'corcodragon-fight') {
      return (
        <Suspense fallback={<Loading />}>
          <CorcodragonFightDetailScreen
            playerCount={playerCount}
            onPlayerCountChange={setPlayerCount}
            prefs={fightPrefs}
            onToggleSound={() => updateFightPrefs({ sound: !fightPrefs.sound })}
            onToggleFx={() => updateFightPrefs({ fx: !fightPrefs.fx })}
            onPlayLocal={(config) => {
              setFightConfig(config);
              setSessionKey((k) => k + 1);
              setScreen('local');
            }}
            onPlayOnline={(config) => {
              setFightConfig(config);
              setSessionKey((k) => k + 1);
              setScreen('online');
            }}
            onlineReady={true}
            onBack={() => setScreen('hall')}
          />
        </Suspense>
      );
    }
    if (selectedGameId === 'corcodragon-fire') {
      return (
        <CorcodragonDetailScreen
          playerCount={playerCount}
          onPlayerCountChange={setPlayerCount}
          aiSpeed={settings.aiSpeed}
          onAiSpeedChange={(ms) => updateSettings({ aiSpeed: ms })}
          onPlayLocal={() => {
            setSessionKey((k) => k + 1);
            setScreen('local');
          }}
          onBack={() => setScreen('hall')}
        />
      );
    }
    return (
      <GameDetailScreen
        playerCount={playerCount}
        onPlayerCountChange={setPlayerCount}
        aiSpeed={settings.aiSpeed}
        onAiSpeedChange={(ms) => updateSettings({ aiSpeed: ms })}
        settings={settings}
        onUpdateSettings={updateSettings}
        onPlayLocal={() => {
          setSessionKey((k) => k + 1);
          setScreen('local');
        }}
        onPlayOnline={() => {
          setSessionKey((k) => k + 1);
          setScreen('online');
        }}
        onBack={() => setScreen('hall')}
      />
    );
  }

  if (screen === 'local') {
    if (selectedGameId === 'corcodragon-fight') {
      return (
        <Suspense fallback={<Loading />}>
          <CorcodragonFightLocalScreen
            key={sessionKey}
            playerCount={playerCount}
            myName={myName}
            config={fightConfig}
            sound={fightPrefs.sound}
            fx={fightPrefs.fx}
            onExit={() => setScreen('game')}
          />
        </Suspense>
      );
    }
    if (selectedGameId === 'corcodragon-fire') {
      return (
        <CorcodragonLocalScreen
          key={sessionKey}
          playerCount={playerCount}
          myName={myName}
          aiSpeed={settings.aiSpeed}
          settings={settings}
          onExit={() => setScreen('game')}
          onRestart={() => setSessionKey((k) => k + 1)}
        />
      );
    }
    return (
      <LocalGameScreen
        key={sessionKey}
        playerCount={playerCount}
        myName={myName}
        settings={settings}
        onExit={() => setScreen('game')}
        onRestart={() => setSessionKey((k) => k + 1)}
        onToggleSound={() => updateSettings({ sound: !settings.sound })}
        onToggleFx={() => updateSettings({ fx: !settings.fx })}
        onToggleLog={() => updateSettings({ showLog: !settings.showLog })}
      />
    );
  }

  if (screen === 'online') {
    if (selectedGameId === 'corcodragon-fight') {
      return (
        <Suspense fallback={<Loading />}>
          <CorcodragonFightOnlineScreen
            key={sessionKey}
            settings={settings}
            prefs={fightPrefs}
            defaultName={myName}
            config={fightConfig}
            onExit={() => setScreen('game')}
            onServerUrlChange={(url) => updateSettings({ serverUrl: url.trim() })}
          />
        </Suspense>
      );
    }
    return (
      <OnlineScreen
        key={sessionKey}
        settings={settings}
        defaultName={myName}
        onExit={() => setScreen('game')}
        onToggleSound={() => updateSettings({ sound: !settings.sound })}
        onToggleFx={() => updateSettings({ fx: !settings.fx })}
        onToggleLog={() => updateSettings({ showLog: !settings.showLog })}
        onServerUrlChange={(url) => updateSettings({ serverUrl: url.trim() })}
      />
    );
  }

  // ---- 云原神风格入口页 → 游戏大厅 ----
  return (
    <CloudGameEntryScreen
      initialName={myName}
      onEnter={(name) => {
        setMyName(name);
        setScreen('hall');
      }}
    />
  );
}
