/**
 * NotificationCenter — 铃铛点开的"消息 + 数据看板"弹层
 * ---------------------------------------------------------------
 * 替代 GameLobbyScreen / EventCenterScreen 顶部导航栏铃铛的 alert 占位。
 * 弹层内容分两个 Tab：
 *   1) 通知公告   — 系统更新 / 活动预告 / 维护通知
 *   2) 数据看板   — 婚姻登记 H1 最新值 + AI 模型价格 Top 5（cacheHit 价由低到高）
 * 数据来源：用户提供的 /Users/guojiong/Desktop/0.1编程项目/【合集】玩具/
 *          API花费计算器/js/data/{marriage.js, api-models.js}，
 * 这里只取最有代表性的若干行做缩略展示，完整看板功能在原 HTML 工具中。
 *
 * 样式：复用 .panel 玻璃态；定位用 fixed，根据 anchorRect 计算位置；点击外部关闭。
 */

import { useEffect, useRef, useState } from 'react';

// ----------------------------------------------------------------------------
// 数据（从用户 API 计算器 js/data 提取的代表性条目）
// ----------------------------------------------------------------------------

interface Announcement {
  id: string;
  type: 'update' | 'event' | 'maintenance' | 'system';
  title: string;
  date: string;
  body: string;
  unread?: boolean;
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'v0.3',
    type: 'update',
    title: 'v0.3 版本更新：活动中心上线',
    date: '08-21',
    body: '新增加活动中心（铃铛 → 通知中心 → 数据看板），查看限时活动与福利。',
    unread: true,
  },
  {
    id: 'spring-fest',
    type: 'event',
    title: '春日赏花祭进行中',
    date: '08-21',
    body: '参与活动得限定头像框 + 200 金币。倒计时 3 天 12 小时。',
    unread: true,
  },
  {
    id: 'maintain',
    type: 'maintenance',
    title: '例行维护通知',
    date: '08-25 02:00 - 04:00',
    body: '凌晨 2:00-4:00 短暂无法登录，请提前保存进度。',
  },
  {
    id: 'weekend-xp',
    type: 'event',
    title: '周末双倍经验',
    date: '本周日 24:00 结束',
    body: '周末全天对战经验 x2，社团成员额外 x0.5。',
  },
  {
    id: 'data-refresh',
    type: 'system',
    title: 'AI 模型价格已同步',
    date: '08-21',
    body: '本次同步覆盖 DeepSeek / OpenAI / Anthropic 等 12 个平台，116 个模型。',
    unread: true,
  },
];

interface ModelPrice {
  rank: number;
  name: string;
  platform: string;
  cacheHit: number;
  input: number;
  output: number;
}

const TOP_MODELS: ModelPrice[] = [
  { rank: 1, name: 'DeepSeek V4 Flash', platform: 'DeepSeek', cacheHit: 0.02, input: 1, output: 2 },
  { rank: 2, name: 'DeepSeek V4 Pro', platform: 'DeepSeek', cacheHit: 0.025, input: 3, output: 6 },
  { rank: 3, name: 'MiMo-V2.5-Pro', platform: 'Xiaomi', cacheHit: 0.03, input: 3.13, output: 6.26 },
  { rank: 4, name: 'DeepSeek V3.2', platform: 'DeepSeek', cacheHit: 0.1, input: 2.02, output: 3.02 },
  { rank: 5, name: 'Hy3', platform: 'Hy', cacheHit: 0.24, input: 0.98, output: 4.01 },
];

// 婚姻数据取最新一行（2026 H1）
const MARRIAGE_LATEST = {
  year: 2026,
  period: 'H1',
  marry: 327.5, // 万对
  divorce: 138.3, // 万对
  ratio: 42.2, // %
  source: '民政部 2026 Q2',
};

// ----------------------------------------------------------------------------
// 类型
// ----------------------------------------------------------------------------

type Tab = 'notice' | 'board';

export interface NotificationCenterProps {
  /** 铃铛 DOM 的位置矩形，由父组件通过 ref + getBoundingClientRect 传入 */
  anchorRect: DOMRect;
  onClose: () => void;
}

// ----------------------------------------------------------------------------
// 组件
// ----------------------------------------------------------------------------

export default function NotificationCenter({ anchorRect, onClose }: NotificationCenterProps) {
  const [tab, setTab] = useState<Tab>('notice');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 用 mousedown 防止与按钮 click 抢顺序
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // 弹层位置：右对齐到 anchor 右边，下方留 8px；超出视口则左移
  const popWidth = 360;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const idealLeft = anchorRect.right - popWidth;
  const left = Math.max(12, Math.min(idealLeft, viewportW - popWidth - 12));
  const top = Math.min(anchorRect.bottom + 8, viewportH - 480);
  const placementAbove = anchorRect.bottom + 480 > viewportH;

  const markAllRead = () => {
    setReadIds(new Set(ANNOUNCEMENTS.map((a) => a.id)));
  };

  const unreadCount = ANNOUNCEMENTS.filter((a) => a.unread && !readIds.has(a.id)).length;

  return (
    <div
      ref={popoverRef}
      className="notification-popover"
      role="dialog"
      aria-label="消息中心"
      style={{
        position: 'fixed',
        top: placementAbove ? anchorRect.top - 8 : top,
        left,
        width: popWidth,
        // placementAbove 时用 transform 翻到 anchor 上方
        ...(placementAbove
          ? { transform: 'translateY(-100%)' }
          : {}),
        zIndex: 1000,
      }}
    >
      <div className="notification-popover-inner">
        {/* 标题栏 */}
        <header className="notification-header">
          <div className="notification-header-left">
            <span className="notification-title">消息中心</span>
            {unreadCount > 0 && (
              <span className="notification-unread-pill">{unreadCount} 未读</span>
            )}
          </div>
          <button
            type="button"
            className="notification-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        {/* Tab 切换 */}
        <div className="notification-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'notice'}
            className={`notification-tab ${tab === 'notice' ? 'is-active' : ''}`}
            onClick={() => setTab('notice')}
          >
            🔔 通知公告
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'board'}
            className={`notification-tab ${tab === 'board' ? 'is-active' : ''}`}
            onClick={() => setTab('board')}
          >
            📈 数据看板
          </button>
        </div>

        {/* 内容区 */}
        <div className="notification-body">
          {tab === 'notice' && (
            <div className="notification-notice-list">
              {ANNOUNCEMENTS.map((a) => {
                const isUnread = !!a.unread && !readIds.has(a.id);
                return (
                  <article
                    key={a.id}
                    className={`notification-notice ${isUnread ? 'is-unread' : ''}`}
                    onClick={() => setReadIds((prev) => new Set(prev).add(a.id))}
                  >
                    <div className="notification-notice-head">
                      <span className={`notification-notice-type notification-notice-type--${a.type}`}>
                        {a.type === 'update' && '更新'}
                        {a.type === 'event' && '活动'}
                        {a.type === 'maintenance' && '维护'}
                        {a.type === 'system' && '系统'}
                      </span>
                      <span className="notification-notice-date">{a.date}</span>
                      {isUnread && <span className="notification-notice-dot" aria-label="未读" />}
                    </div>
                    <h4 className="notification-notice-title">{a.title}</h4>
                    <p className="notification-notice-body">{a.body}</p>
                  </article>
                );
              })}
              {unreadCount > 0 && (
                <div className="notification-notice-footer">
                  <button
                    type="button"
                    className="notification-mark-all"
                    onClick={markAllRead}
                  >
                    ✓ 全部标记已读
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'board' && (
            <div className="notification-board">
              {/* 婚姻数据 KPI */}
              <section className="notification-board-section">
                <header className="notification-board-section-head">
                  <span className="notification-board-section-icon">💒</span>
                  <h5 className="notification-board-section-title">婚姻登记数据</h5>
                  <span className="notification-board-section-meta">{MARRIAGE_LATEST.source}</span>
                </header>
                <div className="notification-kpi-grid">
                  <div className="notification-kpi">
                    <div className="notification-kpi-label">{MARRIAGE_LATEST.year} H1 结婚</div>
                    <div className="notification-kpi-value">
                      {MARRIAGE_LATEST.marry.toFixed(1)}
                      <small> 万对</small>
                    </div>
                  </div>
                  <div className="notification-kpi">
                    <div className="notification-kpi-label">{MARRIAGE_LATEST.year} H1 离婚</div>
                    <div className="notification-kpi-value">
                      {MARRIAGE_LATEST.divorce.toFixed(1)}
                      <small> 万对</small>
                    </div>
                  </div>
                  <div className="notification-kpi notification-kpi--accent">
                    <div className="notification-kpi-label">{MARRIAGE_LATEST.year} H1 离结比</div>
                    <div className="notification-kpi-value">
                      {MARRIAGE_LATEST.ratio.toFixed(1)}
                      <small> %</small>
                    </div>
                  </div>
                </div>
                <p className="notification-board-source">数据来源：民政部季度民政统计（仅含协议离婚）</p>
              </section>

              {/* AI 价格 Top 5 */}
              <section className="notification-board-section">
                <header className="notification-board-section-head">
                  <span className="notification-board-section-icon">🤖</span>
                  <h5 className="notification-board-section-title">AI 模型价格 Top 5</h5>
                  <span className="notification-board-section-meta">按 cache 命中价</span>
                </header>
                <table className="notification-board-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>平台</th>
                      <th>模型</th>
                      <th className="num">cache</th>
                      <th className="num">输入</th>
                      <th className="num">输出</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOP_MODELS.map((m) => (
                      <tr key={m.rank}>
                        <td className="notification-board-rank">{m.rank}</td>
                        <td>{m.platform}</td>
                        <td className="notification-board-model">{m.name}</td>
                        <td className="num">{m.cacheHit.toFixed(3)}</td>
                        <td className="num">{m.input.toFixed(2)}</td>
                        <td className="num">{m.output.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="notification-board-source">单位：元 / M tokens · 数据：Artificial Analysis + DeepSeek 官网</p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
