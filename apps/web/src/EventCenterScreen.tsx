/**
 * EventCenterScreen — 活动中心（独立子页面）
 * ---------------------------------------------------------------
 * 与游戏大厅共用同一套 UI 风格：复用 .lobby-page 背景 / .lobby-nav* 顶部导航栏，
 * 活动卡片、banner、任务区为新增的 .event-* 样式，颜色沿用米白 + 金色高光。
 *
 * 入口：
 *   - 从大厅顶部导航 "活动中心" Tab 进入（router: /#/event-center）
 *   - 大厅其它 Tab 暂未实现，仍由 GameLobbyScreen 内部 alert 占位
 */

import { useRef, useState } from 'react';
import { t, tFmt } from './i18n';
import NotificationCenter from './NotificationCenter';

// ----------------------------------------------------------------------------
// 类型与示例数据（后续接活动 store）
// ----------------------------------------------------------------------------

type EventTag = 'hot' | 'new' | 'limited' | 'guild' | 'newbie';

interface EventItem {
  id: string;
  tag: EventTag;
  title: string;
  desc: string;
  reward: string;
  endLabel: string;
  progress?: { cur: number; max: number };
}

const EVENTS: EventItem[] = [
  {
    id: 'spring-festival',
    tag: 'limited',
    title: '春日赏花祭',
    desc: '参与限时活动，赢取限定头像框 + 200 金币',
    reward: '限定头像框 / 金币 x200',
    endLabel: '剩余 3 天 12 小时',
    progress: { cur: 30, max: 100 },
  },
  {
    id: 'weekend-xp',
    tag: 'hot',
    title: '周末双倍经验',
    desc: '周末全天对战经验 x2，社团成员额外 x0.5',
    reward: '对战经验 x2',
    endLabel: '本周日 24:00 结束',
    progress: { cur: 65, max: 100 },
  },
  {
    id: 'guild-challenge',
    tag: 'guild',
    title: '社团挑战赛',
    desc: '加入社团，与队友一起冲击全服排行榜',
    reward: '社团宝箱 / 排名称号',
    endLabel: '剩余 6 天',
    progress: { cur: 12, max: 50 },
  },
  {
    id: 'first-recharge',
    tag: 'newbie',
    title: '新人首充礼包',
    desc: '首次充值任意金额，立得 3 倍奖励',
    reward: '金币 x600 / 钻石 x30',
    endLabel: '永久有效',
  },
  {
    id: 'crocodaily',
    tag: 'new',
    title: '每日签到',
    desc: '连续签到 7 天可领豪华礼包，断签则重置',
    reward: '金币 / 体力 / 头像',
    endLabel: '每日 00:00 刷新',
    progress: { cur: 3, max: 7 },
  },
  {
    id: 'invite-friend',
    tag: 'new',
    title: '邀请好友',
    desc: '邀请 1 位好友，双方各得 100 金币',
    reward: '金币 x100 / 双向',
    endLabel: '长期活动',
    progress: { cur: 1, max: 5 },
  },
];

const DAILY_TASKS: { id: string; label: string; reward: string; done: boolean }[] = [
  { id: 'play-1', label: '完成 1 场对战', reward: '+20 金币', done: true },
  { id: 'login', label: '每日登录', reward: '+10 经验', done: true },
  { id: 'share', label: '分享 1 次战绩', reward: '+5 金币', done: false },
  { id: 'play-3', label: '完成 3 场对战', reward: '+50 金币', done: false },
];

// ----------------------------------------------------------------------------
// 顶部导航 Tab（与大厅一致；is-active 落在"活动中心"）
// ----------------------------------------------------------------------------

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

export default function EventCenterScreen({
  onBack,
  onSettings,
  playerName,
}: {
  /** 返回游戏大厅（router 层包装为 navigate('/hall')） */
  onBack: () => void;
  onSettings?: () => void;
  playerName: string;
}) {
  const [activeTab, setActiveTab] = useState<NavTab>('events');
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [bellRect, setBellRect] = useState<DOMRect | null>(null);

  const handleTabClick = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'events') return;
    if (tab === 'hall') {
      onBack();
      return;
    }
    if (tab === 'settings' && onSettings) {
      onSettings();
      return;
    }
    window.alert('该栏目还在搭建中，敬请期待 ✨');
  };

  const claim = (id: string) => {
    setClaimedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="lobby-page">
      {/* ===== 背景层（复用大厅的金色光斑） ===== */}
      <div className="lobby-bg" aria-hidden="true">
        <div className="lobby-bg-blob lobby-bg-blob--gold" />
        <div className="lobby-bg-blob lobby-bg-blob--peach" />
        <div className="lobby-bg-blob lobby-bg-blob--apricot" />
        <div className="lobby-bg-stars" />
      </div>

      {/* ===== 主体（全宽，无左侧立绘） ===== */}
      <div className="event-content">
        {/* 顶部导航栏（与大厅共用样式） */}
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
              title="返回游戏大厅"
            >
              <span>{(playerName || '鳄').slice(0, 1)}</span>
            </button>
          </div>
        </nav>

        {/* ===== 页面主体 ===== */}
        <main className="event-main">
          {/* 限时 Banner（主推活动） */}
          <section
            className="event-banner"
            style={{
              backgroundImage:
                'linear-gradient(135deg, rgba(212, 168, 83, 0.18) 0%, rgba(255, 196, 156, 0.22) 100%)',
            }}
            aria-label="限时活动"
          >
            <div className="event-banner-text">
              <span className="event-banner-tag">{t('event.banner.tag')}</span>
              <h1 className="event-banner-title">{t('event.banner.title')}</h1>
              <p className="event-banner-subtitle">{t('event.banner.subtitle')}</p>
              <div className="event-banner-countdown" aria-label="活动倒计时">
                <span className="event-banner-countdown-label">{t('event.banner.countdown')}</span>
                <span className="event-banner-countdown-value">03 天 12:48:36</span>
              </div>
              <button type="button" className="event-banner-cta primary-btn">
                {t('event.banner.cta')}
              </button>
            </div>
            <div className="event-banner-illu" aria-hidden="true">
              <span className="event-banner-illu-emoji">🌸</span>
              <span className="event-banner-illu-emoji event-banner-illu-emoji--alt">🎁</span>
            </div>
          </section>

          {/* 进行中活动 */}
          <section className="event-section" aria-label="进行中的活动">
            <header className="event-section-header">
              <h2 className="event-section-title">
                <span className="event-section-title-mark" aria-hidden="true" />
                {t('event.section.active')}
              </h2>
              <span className="event-section-meta">
                {tFmt('event.section.active.meta', { count: EVENTS.length })}
              </span>
            </header>
            <div className="event-grid">
              {EVENTS.map((ev) => {
                const isClaimed = claimedIds.has(ev.id);
                return (
                  <article key={ev.id} className="event-card panel">
                    <div className="event-card-head">
                      <span className={`event-card-tag event-card-tag--${ev.tag}`}>
                        {t(`event.tag.${ev.tag}`)}
                      </span>
                      {ev.progress && (
                        <span className="event-card-progress-text">
                          {ev.progress.cur}/{ev.progress.max}
                        </span>
                      )}
                    </div>
                    <h3 className="event-card-title">{ev.title}</h3>
                    <p className="event-card-desc">{ev.desc}</p>
                    <div className="event-card-reward">
                      <span className="event-card-reward-label">{t('event.card.reward')}</span>
                      <span className="event-card-reward-value">{ev.reward}</span>
                    </div>
                    {ev.progress && (
                      <div className="event-card-progress" title={`${ev.progress.cur} / ${ev.progress.max}`}>
                        <div
                          className="event-card-progress-fill"
                          style={{ width: `${(ev.progress.cur / ev.progress.max) * 100}%` }}
                        />
                      </div>
                    )}
                    <div className="event-card-foot">
                      <span className="event-card-end">{ev.endLabel}</span>
                      <button
                        type="button"
                        className={`event-card-cta ${isClaimed ? 'is-claimed' : 'primary-btn'}`}
                        onClick={() => claim(ev.id)}
                        disabled={isClaimed}
                      >
                        {isClaimed ? t('event.card.claimed') : t('event.card.cta')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* 任务 / 福利 */}
          <section className="event-section" aria-label="每日任务与福利">
            <header className="event-section-header">
              <h2 className="event-section-title">
                <span className="event-section-title-mark" aria-hidden="true" />
                {t('event.section.daily')}
              </h2>
              <span className="event-section-meta">{t('event.section.daily.meta')}</span>
            </header>
            <div className="event-daily">
              {DAILY_TASKS.map((task) => {
                const isClaimed = claimedIds.has(task.id);
                return (
                  <div
                    key={task.id}
                    className={`event-daily-row ${isClaimed ? 'is-claimed' : ''} ${task.done ? 'is-done' : ''}`}
                  >
                    <span
                      className={`event-daily-check ${task.done ? 'is-done' : ''}`}
                      aria-hidden="true"
                    >
                      {task.done ? '✓' : ''}
                    </span>
                    <span className="event-daily-label">{task.label}</span>
                    <span className="event-daily-reward">{task.reward}</span>
                    <button
                      type="button"
                      className={`event-daily-cta ${isClaimed || !task.done ? 'is-disabled' : 'ghost-btn'}`}
                      onClick={() => task.done && claim(task.id)}
                      disabled={isClaimed || !task.done}
                    >
                      {isClaimed ? t('event.daily.claimed') : t('event.daily.claim')}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
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
