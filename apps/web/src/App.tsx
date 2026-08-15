import { useState } from 'react';
import LocalGameScreen from './LocalGameScreen';
import OnlineScreen from './OnlineScreen';
import CorcodragonFightOnlineScreen from './CorcodragonFightOnlineScreen';
import HallScreen from './HallScreen';
import GameDetailScreen from './GameDetailScreen';
import { DEFAULT_SETTINGS, type GameSettings } from './GameSettings';
import {
  CorcodragonDetailScreen,
  CorcodragonLocalScreen,
} from '@tm/game-corcodragon-fire/GameUI';
import {
  CorcodragonFightDetailScreen,
  CorcodragonFightLocalScreen,
  type FightConfig,
} from '@tm/game-corcodragon-fight/GameUI';

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

type Screen = 'setup' | 'hall' | 'game' | 'local' | 'online';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [playerCount, setPlayerCount] = useState(4);
  const [myName, setMyName] = useState('你');
  const [sessionKey, setSessionKey] = useState(0);
  const [selectedGameId, setSelectedGameId] = useState('trouble-magician');
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [fightConfig, setFightConfig] = useState<FightConfig>({ mode: 'ffa', scoreLimit: 15 });

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

  if (screen === 'hall') {
    return (
      <HallScreen
        onEnter={(gameId) => {
          setSelectedGameId(gameId);
          setScreen('game');
        }}
        onBack={() => setScreen('setup')}
      />
    );
  }

  if (screen === 'game') {
    if (selectedGameId === 'corcodragon-fight') {
      return (
        <CorcodragonFightDetailScreen
          playerCount={playerCount}
          onPlayerCountChange={setPlayerCount}
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
        <CorcodragonFightLocalScreen
          key={sessionKey}
          playerCount={playerCount}
          myName={myName}
          config={fightConfig}
          onExit={() => setScreen('game')}
        />
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
        <CorcodragonFightOnlineScreen
          key={sessionKey}
          settings={settings}
          defaultName={myName}
          config={fightConfig}
          onExit={() => setScreen('game')}
          onServerUrlChange={(url) => updateSettings({ serverUrl: url.trim() })}
        />
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

  // ---- 首页（昵称 → 游戏大厅） ----
  return (
    <div className="page setup-page">
      <div className="panel setup-panel">
        <h1>
          🐊 小鳄龙之家 <span className="subtitle">Game Hall · 游戏大厅</span>
        </h1>
        <p className="tagline">选择游戏，和朋友一起玩</p>

        <label className="field">
          <span>你的名字</span>
          <input value={myName} maxLength={8} onChange={(e) => setMyName(e.target.value)} />
        </label>

        <button className="primary-btn big" onClick={() => setScreen('hall')}>
          🎮 进入游戏大厅
        </button>
      </div>
    </div>
  );
}
