/**
 * CloudGameEntryScreen — 云原神风格入口（简洁版）
 * 直接渲染登录面板，去除对外部 /cloud-entry.html 的依赖
 */

import { useState } from 'react';

export default function CloudGameEntryScreen({
  initialName,
  onEnter,
}: {
  initialName: string;
  onEnter: (name: string) => void;
}) {
  const [name, setName] = useState(initialName || '旅行者');

  return (
    <div className="cloud-entry-wrapper">
      <div className="cloud-login-panel">
        <div className="panel">
          <label className="login-field">
            <span className="login-field-icon" aria-hidden="true"></span>
            <input
              autoFocus
              maxLength={8}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入你的昵称"
              aria-label="玩家昵称"
            />
          </label>
          <button className="primary-btn cloud-enter-btn" onClick={() => onEnter(name.trim() || '旅行者')}>
            <span>进入游戏</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
