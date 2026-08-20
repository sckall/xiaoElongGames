/**
 * LoginScreen — 二次元风登录/昵称页
 * ---------------------------------------------------------------
 * 玩家启动游戏后看到的第一个画面。承担：
 *   - 品牌门面（标题 + LOGO + 副标题）
 *   - 输入昵称 / 选已有账号（后续接入账号系统）
 *   - 「进入游戏」主按钮
 *
 * 风格与大厅保持一致：深紫黑底 + 霓虹粉/青绿 + 玻璃态 + 漂浮光晕。
 */

import { useState } from 'react';
import { t } from './i18n';

export default function LoginScreen({
  initialName,
  onEnter,
}: {
  initialName: string;
  onEnter: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);

  const submit = () => {
    const trimmed = name.trim() || '小鳄鱼';
    onEnter(trimmed);
  };

  return (
    <div className="login-page">
      {/* 背景 */}
      <div className="login-bg" aria-hidden="true">
        <div className="login-bg-blob login-bg-blob--pink" />
        <div className="login-bg-blob login-bg-blob--cyan" />
        <div className="login-bg-blob login-bg-blob--purple" />
        <div className="login-bg-stars" />
        <div className="login-bg-portal" />
      </div>

      {/* 浮动装饰 */}
      <span className="login-mascot login-mascot--ghost" aria-hidden="true">👻</span>
      <span className="login-mascot login-mascot--sparkle1" aria-hidden="true">✨</span>
      <span className="login-mascot login-mascot--sparkle2" aria-hidden="true">✨</span>
      <span className="login-mascot login-mascot--star" aria-hidden="true">⭐</span>

      <div className="login-stage">
        <div className="login-brand">
          <div className="login-logo" aria-hidden="true">
            <span className="login-logo-eye" />
            <span className="login-logo-eye login-logo-eye--right" />
            <span className="login-logo-mouth" />
          </div>
          <h1 className="login-title">
            {t('home.brand')}
            <span className="login-title-sub">{t('home.brandSubtitle')}</span>
          </h1>
          <p className="login-tagline">{t('home.tagline')}</p>
        </div>

        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="login-field">
            <span className="login-field-icon" aria-hidden="true">🐊</span>
            <input
              autoFocus
              maxLength={8}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('home.nameLabel')}
              aria-label={t('home.nameLabel')}
            />
          </label>

          <button type="submit" className="login-enter">
            <span>{t('home.enterHall')}</span>
            <span className="login-enter-arrow" aria-hidden="true">→</span>
          </button>

          <div className="login-hint">
            <span aria-hidden="true">💡</span>
            <span>支持 1-8 字昵称，留空将以「小鳄鱼」进入</span>
          </div>
        </form>

        <div className="login-footer">
          <span>v0.1.0 · 小鳄龙工作室</span>
        </div>
      </div>
    </div>
  );
}