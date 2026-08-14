export default function HallScreen({
  onEnter,
  onBack,
}: {
  onEnter: () => void;
  onBack: () => void;
}) {
  return (
    <div className="page hall-page">
      <div className="hall-wrap">
        <header className="hall-header">
          <h1>🐊 小鳄龙之家</h1>
          <p className="tagline">选择游戏开始游玩</p>
          <div className="hall-actions">
            <button className="ghost-btn" onClick={onBack}>
              ← 返回首页
            </button>
          </div>
        </header>
        <div className="hall-grid">
          <button className="hall-card playable" onClick={onEnter}>
            <span className="hall-emoji">🧙</span>
            <span className="hall-name">出包魔法师</span>
            <span className="hall-meta">回合制 · 实时房间｜2-5 人</span>
            <span className="hall-desc">
              见习魔法师瞎放魔法的欢乐桌游：看不到自己的手牌，喊错魔法就出包！
            </span>
            <span className="hall-cta">进入游戏 →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
