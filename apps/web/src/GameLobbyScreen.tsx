/**
 * GameLobbyScreen — 二次元游戏主界面（大厅）
 * ---------------------------------------------------------------
 * 玩家启动游戏后看到的第一个完整画面，承担：
 *   - 品牌门面 + 角色立绘
 *   - 资源/邮件/设置等玩家 HUD
 *   - 主要入口：「进入开放世界」「开始对局」
 *   - 4 张游戏卡（玻璃态 + 霓虹光晕）
 *   - 装饰：底部聊天、左侧看板娘、浮动装饰
 *
 * 不再是"嵌在世界里"的小弹窗，是 100vw × 100vh 的完整主界面。
 * 参考：青虎 AI「动漫卡牌游戏大厅 UI」prompt 的版式（角色立绘 + 资源条 + 右侧操作面板 + 聊天）。
 */

import { useMemo, useState } from 'react';
import { GAMES } from './games';
import { t, tFmt } from './i18n';

export type LobbyGameKind = 'magician' | 'fight' | 'fire' | 'tavern';

interface LobbyCardMeta {
  gameId: string | null;
  kind: LobbyGameKind;
  color: string;
  color2: string;
  glow: string;
  nameKey: string;
  descKey: string;
  online: number;
  max: number;
  statusKey:
    | 'lobby.card.status.smooth'
    | 'lobby.card.status.busy'
    | 'lobby.card.status.normal'
    | 'lobby.card.status.idle';
  badgeKey:
    | 'lobby.card.badge.online'
    | 'lobby.card.badge.featured'
    | 'lobby.card.badge.upcoming'
    | 'lobby.card.badge.beta';
  icon: string;
  smallIcon: string;
  tagKey: 'lobby.card.tag.turn' | 'lobby.card.tag.realtime' | 'lobby.card.tag.async';
  likes: number;
}

const CARDS: LobbyCardMeta[] = [
  {
    gameId: 'trouble-magician',
    kind: 'magician',
    color: '#d4a853',
    color2: '#b8903e',
    glow: 'rgba(212, 168, 83, 0.45)',
    nameKey: 'lobby.game.magician.name',
    descKey: 'lobby.game.magician.desc',
    online: 4, max: 6,
    statusKey: 'lobby.card.status.smooth',
    badgeKey: 'lobby.card.badge.featured',
    icon: '🧙', smallIcon: '🎩',
    tagKey: 'lobby.card.tag.turn',
    likes: 1280,
  },
  {
    gameId: 'corcodragon-fight',
    kind: 'fight',
    color: '#e0945a',
    color2: '#c87a30',
    glow: 'rgba(224, 148, 90, 0.45)',
    nameKey: 'lobby.game.fight.name',
    descKey: 'lobby.game.fight.desc',
    online: 12, max: 16,
    statusKey: 'lobby.card.status.busy',
    badgeKey: 'lobby.card.badge.online',
    icon: '🐊', smallIcon: '🎮',
    tagKey: 'lobby.card.tag.realtime',
    likes: 3210,
  },
  {
    gameId: 'corcodragon-fire',
    kind: 'fire',
    color: '#c87060',
    color2: '#a04030',
    glow: 'rgba(200, 112, 96, 0.45)',
    nameKey: 'lobby.game.fire.name',
    descKey: 'lobby.game.fire.desc',
    online: 6, max: 8,
    statusKey: 'lobby.card.status.normal',
    badgeKey: 'lobby.card.badge.beta',
    icon: '🔥', smallIcon: '⚔️',
    tagKey: 'lobby.card.tag.turn',
    likes: 860,
  },
  {
    gameId: null,
    kind: 'tavern',
    color: '#88a070',
    color2: '#5a7850',
    glow: 'rgba(136, 160, 112, 0.45)',
    nameKey: 'lobby.game.tavern.name',
    descKey: 'lobby.game.tavern.desc',
    online: 0, max: 4,
    statusKey: 'lobby.card.status.idle',
    badgeKey: 'lobby.card.badge.upcoming',
    icon: '🍺', smallIcon: '🗝️',
    tagKey: 'lobby.card.tag.async',
    likes: 0,
  },
];

export default function GameLobbyScreen({
  onEnter,
  onBack,
  onSettings,
  onStartWorld,
  playerName,
}: {
  /** 进入某个小游戏（与 card onClick 绑定） */
  onEnter: (gameId: string) => void;
  /** 返回昵称设置页 */
  onBack: () => void;
  onSettings?: () => void;
  /** 「进入开放世界」入口（预留：未来接 Three.js 第三人称世界） */
  onStartWorld?: () => void;
  playerName: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<LobbyGameKind>('magician');

  const availableIds = useMemo(
    () => new Set(GAMES.filter((g) => g.available).map((g) => g.id)),
    [],
  );

  // 演示数据（后续接玩家 store）
  const playerLevel = 25;
  const playerExp = 2350;
  const playerExpMax = 4500;
  const playerCoins = 5780;
  const playerGems = 1250;
  const playerBlueCube = 320;
  const dailyStreak = 7;

  return (
    <div className="lobby-page">
      {/* ===== 背景层 ===== */}
      <div className="lobby-bg" aria-hidden="true">
        <div className="lobby-bg-blob lobby-bg-blob--pink" />
        <div className="lobby-bg-blob lobby-bg-blob--cyan" />
        <div className="lobby-bg-blob lobby-bg-blob--purple" />
        <div className="lobby-bg-stars" />
      </div>

      {/* ===== 主体两栏：左侧立绘 + 右侧内容 ===== */}
      <div className="lobby-layout">
        {/* ==== 左侧立绘区 ==== */}
        <aside className="lobby-character">
          <div className="lobby-character-frame">
            <div className="lobby-character-portrait">
              <span className="lobby-character-glow" />
              <span className="lobby-character-emoji" aria-hidden="true">🐊</span>
            </div>
            <div className="lobby-character-info">
              <div className="lobby-character-tag">{tFmt('lobby.character.title', { id: '007' })}</div>
              <h2 className="lobby-character-name">{t('lobby.character.name')}</h2>
              <p className="lobby-character-line">"{t('lobby.character.line')}"</p>
            </div>
            {/* 主入口：进入开放世界 */}
            <button
              className="lobby-character-cta"
              type="button"
              onClick={onStartWorld}
              disabled={!onStartWorld}
            >
              {t('lobby.start')}
            </button>
          </div>
        </aside>

        {/* ==== 右侧主舞台 ==== */}
        <main className="lobby-main">
          {/* 顶部HUD */}
          <header className="lobby-hud">
            <div className="lobby-hud-greet">
              <span className="lobby-hud-greet-text">欢迎回来，{playerName || '冒险者'}！</span>
            </div>

            <div className="lobby-hud-stats">
              <div className="lobby-hud-pill">
                <span>🪙</span>
                <span>{playerCoins}</span>
              </div>
              <div className="lobby-hud-pill">
                <span>💎</span>
                <span>{playerGems}</span>
              </div>
              <div className="lobby-hud-player">
                <div className="lobby-hud-avatar">
                  <span>{(playerName || '鳄').slice(0, 1)}</span>
                </div>
                <div className="lobby-hud-info">
                  <span className="lobby-hud-name">{playerName || t('lobby.user.name')}</span>
                  <span className="lobby-hud-level">Lv.{playerLevel}</span>
                </div>
              </div>
            </div>
          </header>

          {/* 标题区 */}
          <div className="lobby-titlebar">
            <div className="lobby-title-left">
              <span className="lobby-gamepad" aria-hidden="true">🎮</span>
              <div>
                <h1 className="lobby-title">{t('lobby.title')}</h1>
                <p className="lobby-subtitle">{t('lobby.subtitle')}</p>
              </div>
            </div>

            <div className="lobby-title-right">
              <div className="lobby-search">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('lobby.search.placeholder')}
                  aria-label={t('lobby.search.placeholder')}
                />
              </div>
              <button className="lobby-random" type="button">
                <span>🎲</span>
                <span>{t('lobby.random')}</span>
              </button>
              <button
                className="lobby-create"
                type="button"
                onClick={() => {
                  const first = CARDS.find((c) => c.gameId && availableIds.has(c.gameId));
                  if (first?.gameId) onEnter(first.gameId);
                }}
              >
                <span>+</span>
                <span>{t('lobby.createRoom')}</span>
              </button>
            </div>
          </div>

          {/* 4 张游戏卡 */}
          <section className="lobby-cards" aria-label="games">
            {CARDS.map((card) => {
              const isSelected = selectedCard === card.kind;
              const isPlayable = card.gameId !== null && availableIds.has(card.gameId);
              const statusColor =
                card.statusKey === 'lobby.card.status.smooth'
                  ? '#5a8f5c'
                  : card.statusKey === 'lobby.card.status.busy'
                    ? '#d4a017'
                    : card.statusKey === 'lobby.card.status.normal'
                      ? '#b8903e'
                      : '#9ca3af';
              return (
                <article
                  key={card.kind}
                  className={`lobby-card ${isSelected ? 'is-selected' : ''} ${isPlayable ? 'is-playable' : 'is-locked'}`}
                  style={{
                    ['--card-color' as string]: card.color,
                    ['--card-color2' as string]: card.color2,
                    ['--card-glow' as string]: card.glow,
                  }}
                  onMouseEnter={() => setSelectedCard(card.kind)}
                  onClick={() => {
                    if (!isPlayable) return;
                    setSelectedCard(card.kind);
                    if (card.gameId) onEnter(card.gameId);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (!isPlayable) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (card.gameId) onEnter(card.gameId);
                    }
                  }}
                >
                  <div className="lobby-card-iconwrap">
                    <div className="lobby-card-icon" aria-hidden="true">
                      <span>{card.icon}</span>
                    </div>
                    <span className="lobby-card-badge">{t(card.badgeKey)}</span>
                  </div>

                  <div className="lobby-card-text">
                    <span className="lobby-card-tag">{t(card.tagKey)}</span>
                    <h3 className="lobby-card-name">{t(card.nameKey)}</h3>
                    <p className="lobby-card-desc">{t(card.descKey)}</p>
                  </div>

                  <div className="lobby-card-foot">
                    <div className="lobby-card-meta">
                      <span className="lobby-card-players">
                        {tFmt('lobby.card.players', { cur: card.online, max: card.max })}
                      </span>
                      <span className="lobby-card-status" style={{ color: statusColor }}>
                        {t(card.statusKey)}
                      </span>
                    </div>
                    <button
                      className={`lobby-card-cta ${isSelected ? 'is-primary' : 'is-soft'}`}
                      type="button"
                      disabled={!isPlayable}
                    >
                      {isPlayable ? t('lobby.card.action.enter') : t('lobby.card.action.soon')}
                      <span>›</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          {/* 底部：返回 + 聊天面板 */}
          <div className="lobby-bottombar">
            <button className="lobby-exit" onClick={onBack} type="button">
              <span>←</span>
              <span>{t('hall.back')}</span>
            </button>

            <div className="lobby-chat">
              <div className="lobby-chat-header">
                <span>🌍</span>
                <span>{t('lobby.chat.world')}</span>
              </div>
              <div className="lobby-chat-lines">
                <div className="lobby-chat-line">
                  <span className="lobby-chat-name">CardMaster</span>
                  <span className="lobby-chat-text">{tFmt('lobby.chat.line1', { name: playerName || '鳄' })}</span>
                </div>
                <div className="lobby-chat-line">
                  <span className="lobby-chat-name">Valkyrie</span>
                  <span className="lobby-chat-text">{tFmt('lobby.chat.line2', { name: '' })}</span>
                </div>
              </div>
              <div className="lobby-chat-input">
                <input placeholder={t('lobby.chat.placeholder')} aria-label={t('lobby.chat.placeholder')} />
                <button type="button">😊</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}