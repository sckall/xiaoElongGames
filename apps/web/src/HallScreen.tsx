import { useState } from 'react';
import type { ReactNode } from 'react';

interface GameDef {
  id: string;
  name: string;
  emoji: string;
  mode: string;
  players: string;
  desc: string;
  available: boolean;
}

const GAMES: GameDef[] = [
  {
    id: 'trouble-magician',
    name: '出包魔法师',
    emoji: '🧙',
    mode: '回合制 · 实时房间',
    players: '2-5 人',
    desc: '见习魔法师瞎放魔法的欢乐桌游：看不到自己的手牌，喊错魔法就出包！',
    available: true,
  },
  {
    id: 'farm',
    name: '农场大作战',
    emoji: '🚜',
    mode: '异步 · 小数据',
    players: '多人',
    desc: '偷菜 / 增量异步对战（规划中）',
    available: false,
  },
  {
    id: 'arena',
    name: '方块竞技场',
    emoji: '🎯',
    mode: '同步 · 低延迟',
    players: '多人',
    desc: '3D 简易动作竞技（规划中）',
    available: false,
  },
];

export default function HallScreen({
  onEnter,
  onBack,
}: {
  onEnter: (gameId: string) => void;
  onBack: () => void;
}) {
  const [showPlanned, setShowPlanned] = useState(false);

  const cards: ReactNode[] = GAMES.filter((g) => g.available || showPlanned).map((g) =>
    g.available ? (
      <button key={g.id} className="hall-card playable" onClick={() => onEnter(g.id)}>
        <span className="hall-emoji">{g.emoji}</span>
        <span className="hall-name">{g.name}</span>
        <span className="hall-meta">
          {g.mode}｜{g.players}
        </span>
        <span className="hall-desc">{g.desc}</span>
        <span className="hall-cta">进入游戏 →</span>
      </button>
    ) : (
      <div key={g.id} className="hall-card planned">
        <span className="hall-emoji">{g.emoji}</span>
        <span className="hall-name">{g.name}</span>
        <span className="hall-meta">
          {g.mode}｜{g.players}
        </span>
        <span className="hall-desc">{g.desc}</span>
        <span className="hall-cta muted">🚧 敬请期待</span>
      </div>
    ),
  );

  return (
    <div className="page hall-page">
      <div className="hall-wrap">
        <header className="hall-header">
          <h1>🎮 游戏大厅</h1>
          <p className="tagline">一个大厅，N 种玩法：回合制 / 异步 / 实时动作</p>
          <div className="hall-actions">
            <button className="ghost-btn" onClick={onBack}>
              ← 返回设置
            </button>
            <button className="ghost-btn" onClick={() => setShowPlanned((v) => !v)}>
              {showPlanned ? '收起规划中' : '查看规划中的游戏'}
            </button>
          </div>
        </header>
        <div className="hall-grid">{cards}</div>
      </div>
    </div>
  );
}
