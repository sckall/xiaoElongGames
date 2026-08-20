import { GAMES } from './games';

export default function HallScreen({
  onEnter,
  onBack,
}: {
  onEnter: (gameId: string) => void;
  onBack: () => void;
}) {
  const available = GAMES.filter((g) => g.available);
  const modeLabel = (mode: string) =>
    mode === 'turn-based' ? '回合制 · 实时房间' : mode === 'async' ? '异步 · 小数据' : '同步 · 低延迟';
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
          {available.map((g) => (
            <button key={g.id} className="hall-card playable" onClick={() => onEnter(g.id)}>
              <span className="hall-emoji">{g.emoji}</span>
              <span className="hall-name">{g.name}</span>
              <span className="hall-meta">
                {modeLabel(g.mode)}｜{g.minPlayers}-{g.maxPlayers} 人
              </span>
              <span className="hall-desc">{g.description}</span>
              <span className="hall-cta">进入游戏 →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
