import { useState } from 'react';
import LocalGameScreen from './LocalGameScreen';
import OnlineScreen from './OnlineScreen';
import HallScreen from './HallScreen';
import GameDetailScreen from './GameDetailScreen';
import { DEFAULT_SETTINGS, type GameSettings } from './GameSettings';

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
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

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
    return <HallScreen onEnter={() => setScreen('game')} onBack={() => setScreen('setup')} />;
  }

  if (screen === 'game') {
    return (
      <GameDetailScreen
        playerCount={playerCount}
        onPlayerCountChange={setPlayerCount}
        aiSpeed={settings.aiSpeed}
        onAiSpeedChange={(ms) => updateSettings({ aiSpeed: ms })}
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

  // ---- 设置页（昵称 + 偏好 → 游戏大厅） ----
  return (
    <div className="page setup-page">
      <div className="panel setup-panel">
        <h1>
          🧙 出包魔法师 <span className="subtitle">Trouble Magician</span>
        </h1>
        <p className="tagline">连自己会什么魔法都不知道的见习魔法师们，开始瞎放魔法吧！</p>

        <label className="field">
          <span>你的名字</span>
          <input value={myName} maxLength={8} onChange={(e) => setMyName(e.target.value)} />
        </label>

        <div className="field">
          <span>偏好</span>
          <div className="pref-row">
            <button
              className={`pref-btn ${settings.sound ? 'active' : ''}`}
              onClick={() => updateSettings({ sound: !settings.sound })}
            >
              {settings.sound ? '🔊 音效开' : '🔇 音效关'}
            </button>
            <button
              className={`pref-btn ${settings.fx ? 'active' : ''}`}
              onClick={() => updateSettings({ fx: !settings.fx })}
            >
              {settings.fx ? '✨ 动画开' : '💤 动画关'}
            </button>
            <button
              className={`pref-btn ${settings.showLog ? 'active' : ''}`}
              title="战报日志默认隐藏：有些信息（出过的牌）需要玩家自己记忆"
              onClick={() => updateSettings({ showLog: !settings.showLog })}
            >
              {settings.showLog ? '📜 战报开' : '📕 战报关'}
            </button>
          </div>
        </div>

        <button className="primary-btn big" onClick={() => setScreen('hall')}>
          🎮 进入游戏大厅
        </button>
      </div>
    </div>
  );
}
