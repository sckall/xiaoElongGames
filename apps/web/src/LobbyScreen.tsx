import { useState } from 'react';
import { AUTOPILOT_LABELS, type AutopilotMode } from '@tm/rules';
import type { RemoteApi } from './useRemoteGame';
import { lastSavedRoom } from './useRemoteGame';
import { AI_SPEED_PRESETS } from './GameSettings';

export default function LobbyScreen({
  remote,
  defaultName,
  serverUrl,
  onServerUrlChange,
  onExit,
}: {
  remote: RemoteApi;
  defaultName: string;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  onExit: () => void;
}) {
  const [name, setName] = useState(defaultName || '你');
  const [botCount, setBotCount] = useState(2);
  const [code, setCode] = useState('');
  const saved = lastSavedRoom();

  const copyCode = async () => {
    if (!remote.lobby) return;
    try {
      await navigator.clipboard.writeText(remote.lobby.code);
    } catch {
      /* ignore */
    }
  };

  // ---- 大厅 ----
  if (remote.lobby) {
    const me = remote.lobby.players.find((p) => p.id === remote.myId);
    const isHost = me?.isHost ?? false;
    const total = remote.lobby.players.length;
    const st = remote.lobby.settings;
    return (
      <div className="page lobby-page">
        <div className="panel lobby-panel">
          <h1>🧙 联机大厅</h1>
          <div className="room-code" title="点击复制">
            <span className="rc-label">房间码</span>
            <button className="rc-code" onClick={copyCode}>
              {remote.lobby.code} <span className="rc-copy">📋</span>
            </button>
            <span className="rc-tip">把房间码发给朋友，即可加入对战</span>
          </div>

          <ul className="room-players">
            {remote.lobby.players.map((p) => (
              <li key={p.id} className={p.id === remote.myId ? 'is-me' : ''}>
                <span className="rp-avatar">{p.isBot ? '🤖' : '🧙'}</span>
                <span className="rp-name">
                  {p.name}
                  {p.id === remote.myId && '（你）'}
                </span>
                {p.isHost && <span className="rp-host">👑 房主</span>}
                {!p.connected && !p.autopilot && <span className="rp-off">⏳ 断线等待重连</span>}
                {!p.connected && p.autopilot && <span className="rp-off">🤖 AI 托管中</span>}
              </li>
            ))}
          </ul>

          {isHost && remote.lobby.status === 'lobby' && (
            <div className="host-controls">
              <div className="field">
                <span>AI 对手数量：{remote.lobby.botCount}</span>
                <div className="stepper">
                  <button onClick={() => remote.setBots(Math.max(0, remote.lobby!.botCount - 1))}>
                    −
                  </button>
                  <button onClick={() => remote.setBots(remote.lobby!.botCount + 1)}>＋</button>
                </div>
              </div>

              <div className="field">
                <span>断线托管策略（断线多久后交给 AI）</span>
                <select
                  className="bot-select"
                  value={st.autopilot}
                  onChange={(e) =>
                    remote.updateSettings({ autopilot: e.target.value as AutopilotMode })
                  }
                >
                  {(Object.keys(AUTOPILOT_LABELS) as AutopilotMode[]).map((m) => (
                    <option key={m} value={m}>
                      {AUTOPILOT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span>AI 行动节奏</span>
                <select
                  className="bot-select"
                  value={st.aiSpeed}
                  onChange={(e) => remote.updateSettings({ aiSpeed: Number(e.target.value) })}
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
                disabled={total < 2}
                onClick={remote.start}
                title={total < 2 ? '至少 2 名玩家（可添加 AI）' : ''}
              >
                🎮 开始对战（{total} 人）
              </button>
            </div>
          )}
          {isHost && remote.lobby.status === 'playing' && (
            <div className="host-controls">
              <div className="field">
                <span>AI 行动节奏（对局中可调）</span>
                <select
                  className="bot-select"
                  value={st.aiSpeed}
                  onChange={(e) => remote.updateSettings({ aiSpeed: Number(e.target.value) })}
                >
                  {AI_SPEED_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}（{p.value}ms）
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {!isHost && <p className="muted">等待房主开始游戏……</p>}

          {remote.error && <div className="error-box">{remote.error}</div>}

          <button className="ghost-btn" onClick={remote.leave}>
            离开房间
          </button>
        </div>
      </div>
    );
  }

  // ---- 创建 / 加入 ----
  return (
    <div className="page lobby-page">
      <div className="panel lobby-panel">
        <h1>🌐 联机对战</h1>
        <p className="tagline">创建房间分享房间码，或加入朋友的房间</p>

        <label className="field">
          <span>你的名字</span>
          <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="join-block">
          <div className="field">
            <span>创建房间（可加入 AI 补位）</span>
            <div className="create-row">
              <select
                className="bot-select"
                value={botCount}
                onChange={(e) => setBotCount(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4].map((b) => (
                  <option key={b} value={b}>
                    AI ×{b}
                  </option>
                ))}
              </select>
              <button className="primary-btn" onClick={() => remote.create(name, botCount)}>
                ➕ 创建房间
              </button>
            </div>
          </div>

          <div className="field">
            <span>加入房间</span>
            <div className="create-row">
              <input
                className="code-input"
                value={code}
                maxLength={4}
                placeholder="4 位房间码"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button
                className="primary-btn"
                disabled={code.length !== 4}
                onClick={() => remote.join(code, name)}
              >
                加入
              </button>
            </div>
          </div>

          {saved && (
            <button className="ghost-btn rejoin-btn" onClick={remote.rejoin}>
              🔁 重新加入上次的房间（{saved.code}，恢复原座位）
            </button>
          )}
        </div>

        <details className="rules">
          <summary>⚙️ 服务器地址（默认留空 = 自动使用当前网址）</summary>
          <input
            className="server-input"
            value={serverUrl}
            placeholder="例如 http://192.168.1.10:8787 或 https://tm.example.com"
            onChange={(e) => onServerUrlChange(e.target.value)}
          />
          <p className="muted">
            局域网联机：填主机的局域网地址 + 服务端端口；公网服务器：填域名或 IP+端口。修改后重新连接生效。
          </p>
        </details>

        {remote.error && <div className="error-box">{remote.error}</div>}

        <button className="ghost-btn" onClick={onExit}>
          ← 返回设置
        </button>
      </div>
    </div>
  );
}
