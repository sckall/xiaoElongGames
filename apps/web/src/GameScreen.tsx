import { useEffect, useRef } from 'react';
import {
  MAGIC_DEFS,
  MAGIC_LIST,
  MAX_HP,
  type Magic,
  type SeatView,
} from '@tm/rules';
import { useLocalGame } from './useLocalGame';

const EVENT_ICONS: Record<string, string> = {
  roundStart: '🎬',
  turnStart: '▶️',
  cast: '✨',
  dice: '🎲',
  damage: '💥',
  heal: '💚',
  owl: '🦉',
  fail: '😱',
  draw: '🎴',
  turnEnd: '⏭️',
  roundEnd: '🏁',
  gameOver: '🏆',
  info: '💬',
};

function HpBar({ hp }: { hp: number }) {
  return (
    <span className="hp">
      {'❤️'.repeat(hp)}
      {'🖤'.repeat(MAX_HP - hp)}
    </span>
  );
}

function MagicChip({ magic }: { magic: Magic }) {
  const def = MAGIC_DEFS[magic];
  return (
    <span className="chip" title={`${def.name} ×${def.count}：${def.desc}`}>
      {def.emoji}
    </span>
  );
}

function SecretBadge({ seat, isYou }: { seat: SeatView; isYou: boolean }) {
  if (seat.secretCount === 0) return null;
  if (isYou) {
    return (
      <span className="secret-badge" title="你的秘密牌（存活时每张 +1 分）">
        🤫{' '}
        {seat.secrets.map((m, i) =>
          m ? <MagicChip key={i} magic={m} /> : null,
        )}
      </span>
    );
  }
  return <span className="secret-badge">🤫×{seat.secretCount}</span>;
}

function Seat({ seat, isYou, isCurrent }: { seat: SeatView; isYou: boolean; isCurrent: boolean }) {
  return (
    <div className={`seat ${isYou ? 'you' : ''} ${isCurrent ? 'current' : ''} ${seat.alive ? '' : 'dead'}`}>
      <div className="seat-head">
        <span className="seat-name">
          {seat.name}
          {seat.isBot ? ' 🤖' : ''}
          {isCurrent ? ' ⏳' : ''}
        </span>
        <span className="seat-score">⭐{seat.score}</span>
        <span className="seat-secrets">
          <SecretBadge seat={seat} isYou={isYou} />
        </span>
      </div>
      <HpBar hp={seat.hp} />
      <div className="hand">
        {seat.hand.map((m, i) =>
          m ? (
            <MagicChip key={i} magic={m} />
          ) : (
            <span key={i} className="chip back" title="你的手牌（背对自己，看不到）">
              🂠
            </span>
          ),
        )}
        {seat.handCount === 0 && <span className="empty-hand">无手牌</span>}
      </div>
      {!seat.alive && <div className="dead-mark">💀 已倒下</div>}
    </div>
  );
}

export default function GameScreen({
  playerCount,
  myName,
  onExit,
  onRestart,
}: {
  playerCount: number;
  myName: string;
  onExit: () => void;
  onRestart: () => void;
}) {
  const game = useLocalGame(playerCount, myName);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    game.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [game.view?.turnNo, game.view?.events.length]);

  const view = game.view;
  if (!view) return <div className="page">加载中……</div>;

  const you = view.seats.find((s) => s.id === view.youId)!;
  const others = view.seats.filter((s) => s.id !== view.youId);
  const youIdx = view.seats.findIndex((s) => s.id === view.youId);
  const n = view.seats.length;
  const prevSeat = view.seats[(youIdx - 1 + n) % n];
  const nextSeat = view.seats[(youIdx + 1) % n];

  return (
    <div className="page game-page">
      <header className="topbar">
        <div className="topbar-title">🧙 出包魔法师</div>
        <div className="topbar-info">
          <span>第 {view.round} 轮</span>
          <span>🎴 牌堆 {view.deckCount}</span>
          <span>🤫 秘密 {view.secretPileCount}</span>
          <span>🗑️ 弃牌 {view.discard.length}</span>
        </div>
        <button className="ghost-btn" onClick={onExit}>
          退出
        </button>
      </header>

      <main className="board">
        <div className="other-seats">
          {others.map((s) => (
            <Seat key={s.id} seat={s} isYou={false} isCurrent={view.currentPlayerId === s.id} />
          ))}
        </div>

        <div className="your-area">
          <Seat seat={you} isYou isCurrent={view.currentPlayerId === you.id} />
          <div className="you-hint">
            你的上家：{prevSeat.name}（🌨️ 暴风雪目标）｜你的下家：{nextSeat.name}（🔥 火球目标）
          </div>
          <div className="action-bar">
            {MAGIC_LIST.map((m) => {
              const legal = view.legalMagics.includes(m.key);
              const isLast = view.lastMagic === m.key;
              return (
                <button
                  key={m.key}
                  className={`magic-btn ${legal ? '' : 'illegal'} ${isLast ? 'last' : ''}`}
                  disabled={!view.isYourTurn || !legal}
                  onClick={() => game.declare(m.key)}
                  title={m.desc}
                >
                  <span className="magic-btn-emoji">{m.emoji}</span>
                  <span className="magic-btn-name">{m.name}</span>
                  <span className="magic-btn-count">×{m.count}</span>
                </button>
              );
            })}
            <button
              className="end-btn"
              disabled={!view.isYourTurn}
              onClick={game.endTurn}
            >
              ⏭️ 结束回合
            </button>
          </div>
          {view.isYourTurn && view.lastMagic && (
            <div className="restrict-hint">
              你刚施放了 {MAGIC_DEFS[view.lastMagic].emoji}「{MAGIC_DEFS[view.lastMagic].name}」，下一张不能比它更稀有（总张数不能更少）。
            </div>
          )}
        </div>
      </main>

      <aside className="log-panel">
        <h3>📜 战报</h3>
        <div className="log" ref={logRef}>
          {view.events.map((e) => (
            <div key={e.seq} className={`log-line ev-${e.type}`}>
              <span className="log-icon">{EVENT_ICONS[e.type] ?? '•'}</span>
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      </aside>

      {view.phase === 'roundEnd' && view.roundResult && (
        <div className="overlay">
          <div className="panel overlay-panel">
            <h2>🏁 本轮结束</h2>
            <p>{view.roundResult.text}</p>
            <ul className="score-list">
              {view.seats.map((s) => (
                <li key={s.id}>
                  {s.name}：{view.roundResult!.points[s.id] ?? 0} 分（累计 ⭐{s.score}）
                </li>
              ))}
            </ul>
            <p className="muted">3 秒后自动开始下一轮……</p>
            <button className="primary-btn" onClick={game.advanceRound}>
              ▶️ 立即开始下一轮
            </button>
          </div>
        </div>
      )}

      {view.phase === 'gameOver' && (
        <div className="overlay">
          <div className="panel overlay-panel">
            <h2>🏆 游戏结束</h2>
            <p className="winner">
              {view.winnerId
                ? `${view.seats.find((s) => s.id === view.winnerId)!.name} 获胜！`
                : '平局？'}
            </p>
            <ul className="score-list">
              {view.seats.map((s) => (
                <li key={s.id}>
                  {s.name}：⭐{s.score}
                </li>
              ))}
            </ul>
            <div className="overlay-btns">
              <button className="primary-btn" onClick={onRestart}>
                🔁 再来一局
              </button>
              <button className="ghost-btn" onClick={onExit}>
                返回设置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
