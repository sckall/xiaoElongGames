/**
 * CloudGameEntryScreen — 云原神风格入口
 * 全幅立绘背景 + 左上角品牌 + 右下角登录面板
 * 立绘为用户提供的小鳄龙少女图（apps/web/public/characters/character_girl_crocodile.png）
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
    <div className="cloud-entry-wrapper cloud-entry-fullbleed">
      {/* 背景层：用户提供的立绘 + 暗化蒙层 */}
      <div className="cloud-entry-bg" aria-hidden="true" />
      <div className="cloud-entry-overlay" aria-hidden="true" />

      {/* 左上角：品牌 */}
      <header className="cloud-entry-brand">
        <div className="cloud-entry-logo" aria-hidden="true">🐊</div>
        <div className="cloud-entry-brand-text">
          <h1 className="cloud-entry-title">小鳄龙游戏合集</h1>
          <p className="cloud-entry-tagline">在星夜里开始你的冒险</p>
        </div>
      </header>

      {/* 右下角：登录面板 */}
      <div className="cloud-entry-card panel">
        <label className="login-field">
          <span className="login-field-icon" aria-hidden="true">🐊</span>
          <input
            autoFocus
            maxLength={8}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入你的昵称"
            aria-label="玩家昵称"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEnter(name.trim() || '旅行者');
            }}
          />
        </label>
        <button
          className="primary-btn cloud-enter-btn"
          onClick={() => onEnter(name.trim() || '旅行者')}
        >
          <span>进入游戏</span>
          <span aria-hidden="true">→</span>
        </button>
        <div className="cloud-entry-hint">
          <span aria-hidden="true">💡</span>
          <span>支持 1-8 字昵称，留空将以「旅行者」进入</span>
        </div>
      </div>

      {/* 底部版本号 */}
      <footer className="cloud-entry-footer">v0.1.0 · 小鳄龙工作室</footer>
    </div>
  );
}
