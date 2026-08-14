import { useState } from 'react';
import { MAGIC_LIST, MAX_PLAYERS, MIN_PLAYERS } from '@tm/rules';
import LocalGameScreen from './LocalGameScreen';
import OnlineScreen from './OnlineScreen';
import HallScreen from './HallScreen';
import { AI_SPEED_PRESETS, DEFAULT_SETTINGS, type GameSettings } from './GameSettings';

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

type Screen = 'setup' | 'hall' | 'local' | 'online';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [mode, setMode] = useState<'local' | 'online'>('local');
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

  if (screen === 'local') {
    return (
      <LocalGameScreen
        key={sessionKey}
        playerCount={playerCount}
        myName={myName}
        settings={settings}
        onExit={() => setScreen('setup')}
        onRestart={() => setSessionKey((k) => k + 1)}
        onToggleSound={() => updateSettings({ sound: !settings.sound })}
        onToggleFx={() => updateSettings({ fx: !settings.fx })}
        onToggleLog={() => updateSettings({ showLog: !settings.showLog })}
      />
    );
  }

  if (screen === 'hall') {
    return <HallScreen onEnter={() => setScreen('online')} onBack={() => setScreen('setup')} />;
  }

  if (screen === 'online') {
    return (
      <OnlineScreen
        key={sessionKey}
        settings={settings}
        defaultName={myName}
        onExit={() => setScreen('hall')}
        onToggleSound={() => updateSettings({ sound: !settings.sound })}
        onToggleFx={() => updateSettings({ fx: !settings.fx })}
        onToggleLog={() => updateSettings({ showLog: !settings.showLog })}
        onServerUrlChange={(url) => updateSettings({ serverUrl: url.trim() })}
      />
    );
  }

  return (
    <div className="page setup-page">
      <div className="panel setup-panel">
        <h1>
          🧙 出包魔法师 <span className="subtitle">Trouble Magician</span>
        </h1>
        <p className="tagline">连自己会什么魔法都不知道的见习魔法师们，开始瞎放魔法吧！</p>

        <div className="mode-tabs">
          <button
            className={mode === 'local' ? 'mode-tab active' : 'mode-tab'}
            onClick={() => setMode('local')}
          >
            🎮 本地 vs AI
          </button>
          <button
            className={mode === 'online' ? 'mode-tab active' : 'mode-tab'}
            onClick={() => setMode('online')}
          >
            🌐 联机对战
          </button>
        </div>

        <label className="field">
          <span>你的名字</span>
          <input value={myName} maxLength={8} onChange={(e) => setMyName(e.target.value)} />
        </label>

        {mode === 'local' ? (
          <>
            <div className="field">
              <span>玩家总数（其余为 AI）</span>
              <div className="count-picker">
                {Array.from(
                  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
                  (_, i) => MIN_PLAYERS + i,
                ).map((n) => (
                  <button
                    key={n}
                    className={n === playerCount ? 'count-btn active' : 'count-btn'}
                    onClick={() => setPlayerCount(n)}
                  >
                    {n} 人
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>AI 行动节奏</span>
              <select
                className="bot-select"
                value={settings.aiSpeed}
                onChange={(e) => updateSettings({ aiSpeed: Number(e.target.value) })}
              >
                {AI_SPEED_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}（{p.value}ms）
                  </option>
                ))}
              </select>
            </div>
            <button
              className="primary-btn big"
              onClick={() => {
                setSessionKey((k) => k + 1);
                setScreen('local');
              }}
            >
              🎮 开始游戏（本地 vs AI）
            </button>
          </>
        ) : (
          <button
            className="primary-btn big"
            onClick={() => {
              setSessionKey((k) => k + 1);
              setScreen('hall');
            }}
          >
            🌐 进入游戏大厅
          </button>
        )}

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

        <details className="rules">
          <summary>📜 规则速览</summary>
          <ul>
            <li>共 36 张魔法牌、8 种魔法，每种 1~8 张不等。</li>
            <li>你的手牌背对自己：你看不到自己的牌，但能看到所有人的牌。</li>
            <li>
              轮到你说出一个魔法名：有 → 打出并生效，可继续施法（但不能比上一张更稀有）；没有 →
              出包！扣 1 生命并结束回合（巨龙失败扣 1~3）。
            </li>
            <li>回合结束补牌到 5 张。生命上限 6，每轮开始重置。</li>
            <li>
              一轮结束：击杀他人 +3（存活者 +1）；放完所有魔法 +3；自杀则其他人 +1。猫头鹰秘密牌存活时每张再 +1。
            </li>
            <li>先到 8 分且分数最高者获胜。</li>
          </ul>
          <div className="magic-list">
            {MAGIC_LIST.map((m) => (
              <div key={m.key} className="magic-line">
                <span className="magic-emoji">{m.emoji}</span>
                <span className="magic-name">
                  {m.name} ×{m.count}
                </span>
                <span className="magic-desc">{m.desc}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
