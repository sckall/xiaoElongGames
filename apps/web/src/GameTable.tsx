import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MAGIC_DEFS,
  MAGIC_LIST,
  type EffectEvent,
  type Magic,
  type PlayerView,
  type SeatView,
} from '@tm/rules';
import { HpBar, MagicCard } from './components';
import { playSfx, setSoundEnabled } from './fx';
import type { GameSettings } from './GameSettings';

/** 本地与联机共用的游戏操作接口 */
export interface GameApi {
  view: PlayerView | null;
  start: () => void;
  declare: (magic: Magic) => void;
  endTurn: () => void;
  advanceRound: () => void;
  /** true = 轮末由服务端自动推进（联机） */
  autoRound: boolean;
}

interface FloatFx {
  key: number;
  seatId: string;
  text: string;
  kind: 'damage' | 'heal';
}

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

function SecretBadge({ seat, isYou }: { seat: SeatView; isYou: boolean }) {
  if (seat.secretCount === 0) return null;
  if (isYou) {
    return (
      <div className="secret-badge" title="你的秘密牌（本轮存活时每张 +1 分）">
        🤫 {seat.secrets.map((m, i) => (m ? <MagicCard key={i} magic={m} small /> : null))}
      </div>
    );
  }
  return <div className="secret-badge">🤫 ×{seat.secretCount}</div>;
}

function Seat({
  seat,
  isYou,
  isCurrent,
  isPrev,
  isNext,
  shaking,
  floats,
}: {
  seat: SeatView;
  isYou: boolean;
  isCurrent: boolean;
  isPrev: boolean;
  isNext: boolean;
  shaking: boolean;
  floats: FloatFx[];
}) {
  return (
    <div
      className={`seat ${isYou ? 'you' : ''} ${isCurrent ? 'current' : ''} ${seat.alive ? '' : 'dead'} ${shaking ? 'shaking' : ''}`}
    >
      <div className="seat-top">
        <div className={`avatar av-${seat.isBot ? 'bot' : 'human'}`}>{seat.name.slice(0, 1)}</div>
        <div className="seat-info">
          <div className="seat-name">
            {seat.name}
            {seat.isBot && <span className="bot-tag">🤖</span>}
            {isPrev && (
              <span className="rel-tag" title="你的上家">
                🌨️上家
              </span>
            )}
            {isNext && (
              <span className="rel-tag" title="你的下家">
                🔥下家
              </span>
            )}
            {isCurrent && <span className="turn-tag">⏳施法中</span>}
          </div>
          <HpBar hp={seat.hp} shaking={shaking} />
        </div>
        <div className="seat-side">
          <div className="seat-score">⭐ {seat.score}</div>
          <SecretBadge seat={seat} isYou={isYou} />
        </div>
      </div>
      <div className="hand-fan">
        {seat.hand.map((m, i) => (
          <MagicCard key={i} magic={m} hidden={isYou} />
        ))}
        {seat.handCount === 0 && <span className="empty-hand">无手牌</span>}
      </div>
      {!seat.alive && <div className="dead-mark">💀 已倒下</div>}
      {floats.map((f) => (
        <span key={f.key} className={`float-fx ${f.kind}`}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

export default function GameTable({
  api,
  settings,
  onExit,
  onRematch,
  onToggleSound,
  onToggleFx,
}: {
  api: GameApi;
  settings: GameSettings;
  onExit: () => void;
  onRematch?: () => void;
  onToggleSound: () => void;
  onToggleFx: () => void;
}) {
  const [floats, setFloats] = useState<FloatFx[]>([]);
  const [shake, setShake] = useState<{ seatId: string; key: number } | null>(null);
  const [banner, setBanner] = useState<{ magic: Magic; fail: boolean; key: number } | null>(null);
  const [dice, setDice] = useState<{ amount: number; key: number } | null>(null);
  const [confetti, setConfetti] = useState(false);
  const prevSeq = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fxOn = useRef(settings.fx);
  fxOn.current = settings.fx;

  useEffect(() => {
    setSoundEnabled(settings.sound);
  }, [settings.sound]);

  useEffect(() => {
    api.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = api.view;

  // 事件增量 → 特效/音效
  useEffect(() => {
    if (!view) return;
    const last = view.events.length ? view.events[view.events.length - 1].seq : 0;
    if (prevSeq.current === null) {
      prevSeq.current = last;
      return;
    }
    const fresh = view.events.filter((e) => e.seq > prevSeq.current!);
    prevSeq.current = last;
    for (const e of fresh) handleFx(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.turnNo, view?.events.length]);

  // 战报自动滚动
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [view?.events.length]);

  function handleFx(e: EffectEvent) {
    const fx = fxOn.current;
    switch (e.type) {
      case 'damage': {
        if (!e.targetId) break;
        playSfx('damage');
        if (!fx) break;
        const key = e.seq;
        setFloats((f) => [...f, { key, seatId: e.targetId!, text: `-${e.amount ?? 1}`, kind: 'damage' }]);
        setShake({ seatId: e.targetId!, key });
        window.setTimeout(() => {
          setFloats((f) => f.filter((x) => x.key !== key));
          setShake((s) => (s?.key === key ? null : s));
        }, 1400);
        break;
      }
      case 'heal': {
        if (!e.targetId || (e.amount ?? 0) <= 0) break;
        playSfx('heal');
        if (!fx) break;
        const key = e.seq;
        setFloats((f) => [...f, { key, seatId: e.targetId!, text: `+${e.amount}`, kind: 'heal' }]);
        window.setTimeout(() => setFloats((f) => f.filter((x) => x.key !== key)), 1400);
        break;
      }
      case 'cast': {
        playSfx('cast');
        if (fx && e.magic) {
          const key = e.seq;
          setBanner({ magic: e.magic, fail: false, key });
          window.setTimeout(() => setBanner((b) => (b?.key === key ? null : b)), 1200);
        }
        break;
      }
      case 'fail': {
        playSfx('fail');
        if (fx && e.magic) {
          const key = e.seq;
          setBanner({ magic: e.magic, fail: true, key });
          window.setTimeout(() => setBanner((b) => (b?.key === key ? null : b)), 1500);
        }
        break;
      }
      case 'dice': {
        if (e.amount == null) break;
        playSfx('dice');
        if (fx) {
          const key = e.seq;
          setDice({ amount: e.amount, key });
          window.setTimeout(() => setDice((d) => (d?.key === key ? null : d)), 1300);
        }
        break;
      }
      case 'turnStart':
        if (e.playerId === view?.youId) playSfx('turn');
        break;
      case 'roundEnd':
        playSfx('roundEnd');
        break;
      case 'gameOver':
        playSfx('gameOver');
        if (fx) setConfetti(true);
        break;
      default:
        break;
    }
  }

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        dur: 2.2 + Math.random() * 2,
        size: 6 + Math.random() * 8,
        color: ['#ffb84d', '#8a6bff', '#43d17a', '#ff5d73', '#4dd8ff'][i % 5],
        rot: Math.random() * 720,
      })),
    [],
  );

  if (!view) return <div className="page">加载中……</div>;

  const you = view.seats.find((s) => s.id === view.youId)!;
  const others = view.seats.filter((s) => s.id !== view.youId);
  const youIdx = view.seats.findIndex((s) => s.id === view.youId);
  const n = view.seats.length;
  const prevId = view.seats[(youIdx - 1 + n) % n].id;
  const nextId = view.seats[(youIdx + 1) % n].id;

  return (
    <div className="page game-page">
      <header className="topbar">
        <div className="topbar-title">🧙 出包魔法师</div>
        <div className="topbar-info">
          <span className="chip-info">🏷️ 第 {view.round} 轮</span>
          <span className="chip-info">🎴 牌堆 {view.deckCount}</span>
          <span className="chip-info">🤫 秘密 {view.secretPileCount}</span>
          <span className="chip-info">🗑️ 弃牌 {view.discard.length}</span>
          {api.autoRound && <span className="chip-info online">🌐 联机</span>}
        </div>
        <button className="ghost-btn" title={settings.sound ? '关闭音效' : '开启音效'} onClick={onToggleSound}>
          {settings.sound ? '🔊' : '🔇'}
        </button>
        <button className="ghost-btn" title={settings.fx ? '关闭动画' : '开启动画'} onClick={onToggleFx}>
          {settings.fx ? '✨' : '💤'}
        </button>
        <button className="ghost-btn" onClick={onExit}>
          退出
        </button>
      </header>

      <main className="board">
        <div className="opponents">
          {others.map((s) => (
            <Seat
              key={s.id}
              seat={s}
              isYou={false}
              isCurrent={view.currentPlayerId === s.id}
              isPrev={s.id === prevId}
              isNext={s.id === nextId}
              shaking={shake?.seatId === s.id}
              floats={floats.filter((f) => f.seatId === s.id)}
            />
          ))}
        </div>

        <div className="your-zone">
          <div className="turn-status">
            {view.isYourTurn ? (
              <span className="your-turn">✨ 轮到你施法了！大声喊出魔法名！</span>
            ) : (
              <span className="wait-turn">
                ⏳ 等待 {view.currentPlayerId ? view.seats.find((s) => s.id === view.currentPlayerId)?.name : '……'} 施法中
              </span>
            )}
          </div>
          <Seat
            seat={you}
            isYou
            isCurrent={view.currentPlayerId === you.id}
            isPrev={you.id === prevId}
            isNext={you.id === nextId}
            shaking={shake?.seatId === you.id}
            floats={floats.filter((f) => f.seatId === you.id)}
          />
          <div className="action-bar">
            {MAGIC_LIST.map((m) => {
              const legal = view.legalMagics.includes(m.key);
              const isLast = view.lastMagic === m.key;
              return (
                <button
                  key={m.key}
                  className={`magic-btn card-btn-${m.key} ${legal ? '' : 'illegal'} ${isLast ? 'last' : ''}`}
                  disabled={!view.isYourTurn || !legal}
                  onClick={() => api.declare(m.key)}
                  title={m.desc}
                >
                  <span className="mb-emoji">{m.emoji}</span>
                  <span className="mb-name">{m.name}</span>
                  <span className="mb-count">×{m.count}</span>
                  {view.isYourTurn && !legal && <span className="mb-lock">🔒</span>}
                </button>
              );
            })}
            <button className="end-btn" disabled={!view.isYourTurn} onClick={api.endTurn}>
              ⏭️ 结束回合
            </button>
          </div>
          {view.isYourTurn && view.lastMagic && (
            <div className="restrict-hint">
              {MAGIC_DEFS[view.lastMagic].emoji} 已施放「{MAGIC_DEFS[view.lastMagic].name}」：
              下一张魔法不能比它更稀有（总张数不能更少）。
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

      {/* 特效层 */}
      {banner && (
        <div className={`spell-banner ${banner.fail ? 'fail' : ''}`} key={banner.key}>
          {banner.fail ? (
            <span>
              {MAGIC_DEFS[banner.magic].emoji} 出包了！「{MAGIC_DEFS[banner.magic].name}」施放失败！
            </span>
          ) : (
            <span>
              {MAGIC_DEFS[banner.magic].emoji}「{MAGIC_DEFS[banner.magic].name}」！
            </span>
          )}
        </div>
      )}
      {dice && (
        <div className="dice-overlay" key={dice.key}>
          <span className="dice-cube">🎲</span>
          <span className="dice-num">{dice.amount}</span>
        </div>
      )}
      {confetti &&
        confettiPieces.map((p, i) => (
          <span
            key={i}
            className="confetti"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.6,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              transform: `rotate(${p.rot}deg)`,
            }}
          />
        ))}

      {/* 轮末 / 终局弹层 */}
      {view.phase === 'roundEnd' && view.roundResult && (
        <div className="overlay">
          <div className="panel overlay-panel">
            <h2>🏁 本轮结束</h2>
            <p>{view.roundResult.text}</p>
            <ul className="score-list">
              {view.seats.map((s) => (
                <li key={s.id}>
                  {s.name}：
                  <b className={view.roundResult!.points[s.id] > 0 ? 'gain' : ''}>
                    +{view.roundResult!.points[s.id] ?? 0}
                  </b>{' '}
                  （累计 ⭐{s.score}）
                </li>
              ))}
            </ul>
            {api.autoRound ? (
              <p className="muted">等待服务器自动开始下一轮……</p>
            ) : (
              <>
                <p className="muted">3 秒后自动开始下一轮……</p>
                <button className="primary-btn" onClick={api.advanceRound}>
                  ▶️ 立即开始下一轮
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {view.phase === 'gameOver' && (
        <div className="overlay">
          <div className="panel overlay-panel">
            <h2>🏆 游戏结束</h2>
            <p className="winner">
              {view.winnerId
                ? `${view.seats.find((s) => s.id === view.winnerId)!.name} 获得最终胜利！`
                : '平局！'}
            </p>
            <ul className="score-list">
              {[...view.seats]
                .sort((a, b) => b.score - a.score)
                .map((s, i) => (
                  <li key={s.id}>
                    {['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i] ?? ''} {s.name}：⭐{s.score}
                  </li>
                ))}
            </ul>
            <div className="overlay-btns">
              {onRematch && (
                <button className="primary-btn" onClick={onRematch}>
                  🔁 再来一局
                </button>
              )}
              <button className="ghost-btn" onClick={onExit}>
                {api.autoRound ? '离开房间' : '返回设置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
