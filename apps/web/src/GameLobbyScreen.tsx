/**
 * GameLobbyScreen — 二次元游戏主界面（大厅）
 * ---------------------------------------------------------------
 * 布局参考 /Users/guojiong/Desktop/游戏大厅UI素材/source.png：
 *   左侧 32% 立绘  |  右侧 68% 内容
 *   右侧自上而下分三段：
 *     1) 顶部导航栏（参考 ui_preview.html：Logo + 6 个 Tab + 铃铛 + 头像）
 *     2) 中部主舞台：标题 + 搜索/创建 + 4 张游戏卡 + 主推轮播指示器
 *     3) 底部 4 个并排小卡：用户卡 / 在线成员 / 社团公告 / 时间
 *
 * 配色沿用项目主题：米白暖底 + 金色高光（不取原参考图绿色）。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { GAMES } from './games';
import { t, tFmt } from './i18n';
import NotificationCenter from './NotificationCenter';

const BASE = import.meta.env.BASE_URL;

// ----------------------------------------------------------------------------
// 卡片元数据（与原版一致）
// ----------------------------------------------------------------------------

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
  coverWebp: string | null;
  coverPng: string | null;
  icon: string;
  smallIcon: string;
  tagKey: 'lobby.card.tag.turn' | 'lobby.card.tag.realtime' | 'lobby.card.tag.async';
  likes: number;
}

const CARDS: LobbyCardMeta[] = [
  {
    gameId: 'corcodragon-fight',
    kind: 'fight',
    color: '#e0945a',
    color2: '#c87a30',
    glow: 'rgba(224, 148, 90, 0.45)',
    nameKey: 'lobby.game.fight.name',
    descKey: 'lobby.game.fight.desc',
    online: 12,
    max: 16,
    statusKey: 'lobby.card.status.busy',
    badgeKey: 'lobby.card.badge.featured',
    coverWebp: `${BASE}hall/cover-fight.webp`,
    coverPng: null,
    icon: '🐊',
    smallIcon: '🎮',
    tagKey: 'lobby.card.tag.realtime',
    likes: 3210,
  },
  {
    gameId: 'trouble-magician',
    kind: 'magician',
    color: '#d4a853',
    color2: '#b8903e',
    glow: 'rgba(212, 168, 83, 0.45)',
    nameKey: 'lobby.game.magician.name',
    descKey: 'lobby.game.magician.desc',
    online: 4,
    max: 6,
    statusKey: 'lobby.card.status.smooth',
    badgeKey: 'lobby.card.badge.online',
    coverWebp: `${BASE}hall/cover-magician.webp`,
    coverPng: null,
    icon: '🧙',
    smallIcon: '🎩',
    tagKey: 'lobby.card.tag.turn',
    likes: 1280,
  },
  {
    gameId: 'corcodragon-fire',
    kind: 'fire',
    color: '#c87060',
    color2: '#a04030',
    glow: 'rgba(200, 112, 96, 0.45)',
    nameKey: 'lobby.game.fire.name',
    descKey: 'lobby.game.fire.desc',
    online: 6,
    max: 8,
    statusKey: 'lobby.card.status.normal',
    badgeKey: 'lobby.card.badge.beta',
    coverWebp: `${BASE}hall/cover-fire.webp`,
    coverPng: null,
    icon: '🔥',
    smallIcon: '⚔️',
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
    online: 0,
    max: 4,
    statusKey: 'lobby.card.status.idle',
    badgeKey: 'lobby.card.badge.upcoming',
    coverWebp: null,
    coverPng: null,
    icon: '🍺',
    smallIcon: '🗝️',
    tagKey: 'lobby.card.tag.async',
    likes: 0,
  },
];

const FEATURABLE_KINDS: LobbyGameKind[] = CARDS.filter((c) => c.coverWebp).map((c) => c.kind);
const FEATURED_INTERVAL_MS = 8000;

// 顶部导航 Tab（参考 ui_preview.html 顺序）
type NavTab = 'hall' | 'friends' | 'rank' | 'events' | 'guild' | 'settings';
const NAV_TABS: { id: NavTab; label: string }[] = [
  { id: 'hall', label: '游戏大厅' },
  { id: 'friends', label: '好友' },
  { id: 'rank', label: '排行榜' },
  { id: 'events', label: '活动中心' },
  { id: 'guild', label: '社团' },
  { id: 'settings', label: '设置' },
];

// ----------------------------------------------------------------------------
// 组件
// ----------------------------------------------------------------------------

export default function GameLobbyScreen({
  onEnter,
  onBack,
  onSettings,
  onEvents,
  onStartWorld,
  playerName,
}: {
  onEnter: (gameId: string) => void;
  onBack: () => void;
  onSettings?: () => void;
  onEvents?: () => void;
  onStartWorld?: () => void;
  playerName: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<LobbyGameKind>('fight');
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [justFeatured, setJustFeatured] = useState<LobbyGameKind | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('hall');
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [bellRect, setBellRect] = useState<DOMRect | null>(null);

  const availableIds = useMemo(
    () => new Set(GAMES.filter((g) => g.available).map((g) => g.id)),
    [],
  );

  // 主推卡自动轮播
  useEffect(() => {
    if (FEATURABLE_KINDS.length <= 1 || isPaused) return;
    const id = setInterval(() => {
      setFeaturedIdx((i) => (i + 1) % FEATURABLE_KINDS.length);
    }, FEATURED_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPaused]);

  const featuredKind = FEATURABLE_KINDS[featuredIdx] ?? null;
  useEffect(() => {
    if (!featuredKind) return;
    setJustFeatured(featuredKind);
    const id = window.setTimeout(() => {
      setJustFeatured((cur) => (cur === featuredKind ? null : cur));
    }, 700);
    return () => window.clearTimeout(id);
  }, [featuredKind]);

  const orderedCards = useMemo(() => {
    if (!featuredKind) return CARDS;
    const idx = CARDS.findIndex((c) => c.kind === featuredKind);
    if (idx <= 0) return CARDS;
    return [CARDS[idx], ...CARDS.slice(0, idx), ...CARDS.slice(idx + 1)];
  }, [featuredKind]);

  // 演示数据（后续接玩家 store）
  const playerLevel = 25;
  const playerExpCur = 1820;
  const playerExpMax = 2500;
  const onlineCount = 128;

  // 底部时间卡片用
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[now.getDay()];

  // 切到非 hall Tab 的提示
  const handleTabClick = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'hall') return;
    if (tab === 'events' && onEvents) {
      onEvents();
      return;
    }
    if (tab === 'settings' && onSettings) {
      onSettings();
      return;
    }
    window.alert('该栏目还在搭建中，敬请期待 ✨');
  };

  return (
    <div className="lobby-page">
      {/* ===== 背景层 ===== */}
      <div className="lobby-bg" aria-hidden="true">
        <div className="lobby-bg-blob lobby-bg-blob--gold" />
        <div className="lobby-bg-blob lobby-bg-blob--peach" />
        <div className="lobby-bg-blob lobby-bg-blob--apricot" />
        <div className="lobby-bg-stars" />
      </div>

      {/* ===== 主体两栏：左 32% 立绘 / 右 68% 内容 ===== */}
      <div className="lobby-layout">
        {/* ==== 左侧立绘区(用登录页立绘做背景) ==== */}
        <aside className="lobby-character">
          <div className="lobby-character-frame">
            {/* 立绘做整框背景 */}
            <div className="lobby-character-bg" aria-hidden="true">
              <img
                className="lobby-character-bg-img"
                src={`${BASE}characters/character_girl_crocodile.png`}
                alt=""
                draggable={false}
                loading="eager"
                decoding="async"
              />
              <div className="lobby-character-bg-shade" />
            </div>

            {/* 浮在立绘底部的信息块 */}
            <div className="lobby-character-info">
              <div className="lobby-character-tag">{tFmt('lobby.character.title', { id: '007' })}</div>
              <h2 className="lobby-character-name">{t('lobby.character.name')}</h2>
              <p className="lobby-character-line">"{t('lobby.character.line')}"</p>
            </div>
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

        {/* ==== 右侧内容 ==== */}
        <div className="lobby-content">
          {/* 顶部导航栏(参考 ui_preview.html) */}
          <nav className="lobby-nav" aria-label="主导航">
            <div className="lobby-nav-logo">
              <span className="lobby-nav-logo-icon" aria-hidden="true">🐊</span>
              <div className="lobby-nav-logo-text">
                <span className="lobby-nav-logo-zh">小鳄龙之家</span>
                <span className="lobby-nav-logo-en">GATOR HOME</span>
              </div>
            </div>

            <div className="lobby-nav-tabs" role="tablist">
              {NAV_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`lobby-nav-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => handleTabClick(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="lobby-nav-actions">
              <button
                type="button"
                className="lobby-nav-bell"
                aria-label="通知"
                ref={bellRef}
                onClick={() => {
                  if (bellRef.current) setBellRect(bellRef.current.getBoundingClientRect());
                  setNotifOpen((v) => !v);
                }}
              >
                <span aria-hidden="true">🔔</span>
                <span className="lobby-nav-bell-dot" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="lobby-nav-avatar"
                aria-label="账号"
                onClick={onBack}
                title="点击退出登录"
              >
                <span>{(playerName || '鳄').slice(0, 1)}</span>
              </button>
            </div>
          </nav>

          {/* 中部主舞台：标题 + 搜索/创建 + 4 张卡 + dots */}
          <main className="lobby-main">
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
                    ]
                      .filter(Boolean)
                      .join(' ')}
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
                    <div className="lobby-card-cover">
                      {card.coverWebp || card.coverPng ? (
                        <picture>
                          {card.coverWebp && <source srcSet={card.coverWebp} type="image/webp" />}
                          {card.coverPng && <source srcSet={card.coverPng} type="image/png" />}
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
          </main>

          {/* 底部 4 个并排小卡(参考 source.png 底部 4 卡) */}
          <div className="lobby-bottom-cards">
            <div className="lobby-bottom-card lobby-bottom-card--user">
              <div className="lobby-bottom-avatar" aria-hidden="true">
                <span>{(playerName || '鳄').slice(0, 1)}</span>
              </div>
              <div className="lobby-bottom-user">
                <div className="lobby-bottom-user-name">
                  <span>{playerName || t('lobby.user.name')}</span>
                  <span className="lobby-bottom-user-level">Lv.{playerLevel}</span>
                </div>
                <div className="lobby-bottom-exp" title={`${playerExpCur} / ${playerExpMax}`}>
                  <div
                    className="lobby-bottom-exp-fill"
                    style={{ width: `${(playerExpCur / playerExpMax) * 100}%` }}
                  />
                </div>
                <div className="lobby-bottom-exp-text">
                  {playerExpCur} / {playerExpMax}
                </div>
              </div>
            </div>

            <div className="lobby-bottom-card lobby-bottom-card--online">
              <div className="lobby-bottom-icon" aria-hidden="true">👥</div>
              <div className="lobby-bottom-online">
                <div className="lobby-bottom-online-num">{onlineCount}</div>
                <div className="lobby-bottom-online-label">
                  <span className="lobby-bottom-online-dot" />
                  <span>在线成员 · 活跃</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="lobby-bottom-card lobby-bottom-card--notice"
              onClick={() => window.alert('社团公告：暂无新公告 ✨')}
            >
              <div className="lobby-bottom-icon" aria-hidden="true">💬</div>
              <div className="lobby-bottom-notice">
                <div className="lobby-bottom-notice-title">
                  <span>社团公告</span>
                  <span className="lobby-bottom-notice-badge">NEW</span>
                </div>
                <div className="lobby-bottom-notice-line" />
                <div className="lobby-bottom-notice-line is-short" />
              </div>
              <div className="lobby-bottom-chev" aria-hidden="true">›</div>
            </button>

            <div className="lobby-bottom-card lobby-bottom-card--time">
              <div className="lobby-bottom-time-mascot" aria-hidden="true">🐊</div>
              <div className="lobby-bottom-time">
                <div className="lobby-bottom-time-hhmm">
                  {hh}:{mm}
                  <span className="lobby-bottom-time-sun" aria-hidden="true">☀</span>
                </div>
                <div className="lobby-bottom-time-date">{yyyy}/{mo}/{dd}</div>
                <div className="lobby-bottom-time-week">{weekday}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {notifOpen && bellRect && (
        <NotificationCenter
          anchorRect={bellRect}
          onClose={() => setNotifOpen(false)}
        />
      )}
    </div>
  );
}
