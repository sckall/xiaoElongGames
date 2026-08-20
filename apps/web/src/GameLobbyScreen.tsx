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

import { useEffect, useMemo, useRef, useState } from 'react';
import { GAMES } from './games';
import { t, tFmt } from './i18n';

/** Vite 注入的 base 路径（dev: '/'，build 根路径部署: './'，子路径部署: './<subpath>/'） */
const BASE = import.meta.env.BASE_URL;

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
  /** WebP 封面图（首选，更省带宽）；无封面时用 emoji icon 兜底 */
  coverWebp: string | null;
  /** PNG 封面图（fallback，兼容老浏览器） */
  coverPng: string | null;
  icon: string;
  smallIcon: string;
  tagKey: 'lobby.card.tag.turn' | 'lobby.card.tag.realtime' | 'lobby.card.tag.async';
  likes: number;
}

const CARDS: LobbyCardMeta[] = [
  // 鳄龙咆哮（FPS · 3D 实时英雄射击）
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
    badgeKey: 'lobby.card.badge.featured',
    coverWebp: `${BASE}hall/cover-fight.webp`,
    coverPng: null,
    icon: '🐊', smallIcon: '🎮',
    tagKey: 'lobby.card.tag.realtime',
    likes: 3210,
  },
  // 出包魔法师（卡牌桌游）
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
    badgeKey: 'lobby.card.badge.online',
    coverWebp: `${BASE}hall/cover-magician.webp`,
    coverPng: null,
    icon: '🧙', smallIcon: '🎩',
    tagKey: 'lobby.card.tag.turn',
    likes: 1280,
  },
  // 鳄龙战场（回合制英雄战术）
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
    coverWebp: `${BASE}hall/cover-fire.webp`,
    coverPng: null,
    icon: '🔥', smallIcon: '⚔️',
    tagKey: 'lobby.card.tag.turn',
    likes: 860,
  },
  // 小酒馆大冒险（占位 · 敬请期待）
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
    coverWebp: null,
    coverPng: null,
    icon: '🍺', smallIcon: '🗝️',
    tagKey: 'lobby.card.tag.async',
    likes: 0,
  },
];

/** 可作为主推轮播的卡（必须有封面图） */
const FEATURABLE_KINDS: LobbyGameKind[] = CARDS
  .filter((c) => c.coverWebp)
  .map((c) => c.kind);

/** 主推卡轮播间隔（ms） */
const FEATURED_INTERVAL_MS = 8000;

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
  const [selectedCard, setSelectedCard] = useState<LobbyGameKind>('fight');
  /** 主推轮播索引（在 FEATURABLE_KINDS 中的位置） */
  const [featuredIdx, setFeaturedIdx] = useState(0);
  /** 鼠标悬停在卡片上时暂停轮播 */
  const [isPaused, setIsPaused] = useState(false);
  /** 主推刚切换的 kind（用于播切换动画，700ms 后自动清除） */
  const [justFeatured, setJustFeatured] = useState<LobbyGameKind | null>(null);

  const availableIds = useMemo(
    () => new Set(GAMES.filter((g) => g.available).map((g) => g.id)),
    [],
  );

  // 主推卡自动轮播：可被 hover 暂停
  useEffect(() => {
    if (FEATURABLE_KINDS.length <= 1 || isPaused) return;
    const id = setInterval(() => {
      setFeaturedIdx((i) => (i + 1) % FEATURABLE_KINDS.length);
    }, FEATURED_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPaused]);

  // 主推卡切换动画：标记为"刚主推"，700ms 后清除（让 CSS 动画播完）
  const featuredKind = FEATURABLE_KINDS[featuredIdx] ?? null;
  useEffect(() => {
    if (!featuredKind) return;
    setJustFeatured(featuredKind);
    const id = window.setTimeout(() => {
      setJustFeatured((cur) => (cur === featuredKind ? null : cur));
    }, 700);
    return () => window.clearTimeout(id);
  }, [featuredKind]);

  // 演示数据（后续接玩家 store）
  const playerLevel = 25;
  const playerCoins = 5780;
  const playerGems = 1250;

  // 按轮播顺序重排：当前主推卡放最前
  const orderedCards = useMemo(() => {
    if (!featuredKind) return CARDS;
    const idx = CARDS.findIndex((c) => c.kind === featuredKind);
    if (idx <= 0) return CARDS;
    return [CARDS[idx], ...CARDS.slice(0, idx), ...CARDS.slice(idx + 1)];
  }, [featuredKind]);

  return (
    <div className="lobby-page">
      {/* ===== 背景层（米白暖底 + 暖金/蜜桃/浅杏光斑） ===== */}
      <div className="lobby-bg" aria-hidden="true">
        <div className="lobby-bg-blob lobby-bg-blob--gold" />
        <div className="lobby-bg-blob lobby-bg-blob--peach" />
        <div className="lobby-bg-blob lobby-bg-blob--apricot" />
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

          {/* 游戏卡：1 张主推（双倍宽 + 真实封面大图） + 3 张普通卡 */}
          <section
            className="lobby-cards"
            aria-label="games"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {orderedCards.map((card) => {
              const isSelected = selectedCard === card.kind;
              const isPlayable = card.gameId !== null && availableIds.has(card.gameId);
              const isFeatured = card.kind === featuredKind;
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
                  className={[
                    'lobby-card',
                    isSelected ? 'is-selected' : '',
                    isPlayable ? 'is-playable' : 'is-locked',
                    isFeatured ? 'is-featured' : '',
                    justFeatured === card.kind ? 'is-just-featured' : '',
                  ].filter(Boolean).join(' ')}
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
                  {/* 封面图 / 占位 icon（picture 优先 WebP，回退 PNG） */}
                  <div className="lobby-card-cover">
                    {card.coverWebp || card.coverPng ? (
                      <picture>
                        {card.coverWebp && (
                          <source srcSet={card.coverWebp} type="image/webp" />
                        )}
                        {card.coverPng && (
                          <source srcSet={card.coverPng} type="image/png" />
                        )}
                        <img
                          className="lobby-card-cover-img"
                          src={card.coverPng ?? card.coverWebp ?? ''}
                          alt={t(card.nameKey)}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      </picture>
                    ) : (
                      <div className="lobby-card-cover-fallback" aria-hidden="true">
                        <span>{card.icon}</span>
                      </div>
                    )}
                    <span className="lobby-card-cover-shade" aria-hidden="true" />
                    <span className="lobby-card-badge">{t(card.badgeKey)}</span>
                    {isFeatured && (
                      <span className="lobby-card-featured-ribbon" aria-hidden="true">
                        ✦ 精选
                      </span>
                    )}
                  </div>

                  <div className="lobby-card-body">
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
                  </div>
                </article>
              );
            })}
          </section>

          {/* 主推轮播指示器（dots） */}
          {FEATURABLE_KINDS.length > 1 && (
            <div className="lobby-featured-dots" role="tablist" aria-label="主推轮播">
              {FEATURABLE_KINDS.map((kind, i) => {
                const isActive = i === featuredIdx;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`主推 ${i + 1}/${FEATURABLE_KINDS.length}`}
                    className={`lobby-featured-dot ${isActive ? 'is-active' : ''}`}
                    onClick={() => setFeaturedIdx(i)}
                  />
                );
              })}
            </div>
          )}

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
