/**
 * CloudGameEntryScreen — 云原神风格入口（简洁版）
 * iframe加载完成后显示右侧登录面板
 */

import { useState, useRef } from 'react';

export default function CloudGameEntryScreen({
  initialName,
  onEnter,
}: {
  initialName: string;
  onEnter: (name: string) => void;
}) {
  const [name, setName] = useState(initialName || '旅行者');
  const [iframeLoaded, setIframeLoaded] = useState(false);

  return (
    <div className="cloud-entry-wrapper">
      {/* 原神网页iframe - 全屏背景 */}
      <div className="cloud-iframe-container">
        <iframe
          src="/cloud-entry.html"
          title="云游戏平台"
          className="cloud-iframe"
          onLoad={() => setIframeLoaded(true)}
          sandbox="allow-scripts allow-same-origin"
        />
        {!iframeLoaded && (
          <div className="cloud-loading-overlay">
            <div className="cloud-loading-spinner" />
            <p className="cloud-loading-text">加载中...</p>
          </div>
        )}
      </div>

      {/* 右侧登录面板 - iframe加载后显示 */}
      {iframeLoaded && (
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
      )}
    </div>
  );
}
