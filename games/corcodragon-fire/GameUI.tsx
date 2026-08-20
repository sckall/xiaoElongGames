import { useEffect, useRef, useState } from 'react';
import {
  ARENA_SIZE,
  CorcodragonEngine,
  HERO_DEFS,
  HERO_LIST,
  OBSTACLES,
  WEAPON_DEFS,
  WEAPON_LIST,
  type CorcodragonAction,
  type CorcodragonView,
  type HeroId,
  type WeaponId,
} from './engine';
import { chooseAiAction } from './ai';

const BOT_NAMES = ['阿呆', '梅林', '小圆', '老巴', '大壮', '二丫', '铁蛋'];

const AI_SPEED_PRESETS = [
  { label: '慢速', value: 1800 },
  { label: '中速', value: 1100 },
  { label: '快速', value: 650 },
  { label: '极速', value: 350 },
];

const EVENT_ICONS: Record<string, string> = {
  info: '💬',
  heroSelect: '🦸',
  turnStart: '▶️',
  move: '👣',
  shoot: '🔫',
  damage: '💥',
  heal: '💚',
  skill: '✨',
  ult: '🌩️',
  kill: '☠️',
  respawn: '🔄',
  reload: '🔃',
  switch: '🔁',
  bomb: '💣',
  zone: '🌀',
  gameOver: '🏆',
};

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function HeroSelect({
  view,
  onSelect,
}: {
  view: CorcodragonView;
  onSelect: (hero: HeroId) => void;
}) {
  return (
    <div className="cdf-page">
      <div className="cdf-panel cdf-hero-panel">
        <h1>🐊 鳄龙战场</h1>
        <p className="cdf-tagline">选择你的英雄，进入竞技场</p>
        <div className="cdf-hero-grid">
          {HERO_LIST.map((h) => {
            const taken = !view.availableHeroes.includes(h.key);
            return (
              <button
                key={h.key}
                className={`cdf-hero-card ${taken ? 'taken' : ''}`}
                disabled={taken}
                onClick={() => onSelect(h.key)}
              >
                <span className="cdf-hero-emoji">{h.emoji}</span>
                <span className="cdf-hero-name">{h.name}</span>
                <span className="cdf-hero-role">{h.role}</span>
                <span className="cdf-hero-hp">HP {h.hp}</span>
                <span className="cdf-hero-skill">
                  ✨ {h.skillName}：{h.skillDesc}
                </span>
                <span className="cdf-hero-ult">
                  🌩️ {h.ultName}：{h.ultDesc}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HpBar({ hp, max, shield = 0 }: { hp: number; max: number; shield?: number }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <div className="cdf-hp-wrap">
      <div className="cdf-hp-bar">
        <div className="cdf-hp-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cdf-hp-text">
        {hp}/{max}
        {shield > 0 ? ` 🛡${shield}` : ''}
      </span>
    </div>
  );
}

function GameOver({
  view,
  onRestart,
  onExit,
}: {
  view: CorcodragonView;
  onRestart?: () => void;
  onExit: () => void;
}) {
  return (
    <div className="cdf-overlay">
      <div className="cdf-panel cdf-result-panel">
        <h1>🏆</h1>
        <h2>{view.result?.text ?? '对局结束'}</h2>
        <ul className="cdf-rankings">
          {(view.result?.rankings ?? []).map((r, i) => (
            <li key={r.id}>
              <span className="cdf-rank-no">{i + 1}</span>
              <span className="cdf-rank-name">{r.name}</span>
              <span className="cdf-rank-stat">击杀 {r.kills}</span>
              <span className="cdf-rank-stat">助攻 {r.assists}</span>
              <span className="cdf-rank-stat">死亡 {r.deaths}</span>
              <span className="cdf-rank-score">⭐ {r.score}</span>
            </li>
          ))}
        </ul>
        <div className="cdf-row">
          {onRestart && (
            <button className="cdf-btn primary" onClick={onRestart}>
              🔄 再来一局
            </button>
          )}
          <button className="cdf-btn ghost" onClick={onExit}>
            退出
          </button>
        </div>
      </div>
    </div>
  );
}

export function CorcodragonLocalScreen({
  playerCount,
  myName,
  aiSpeed,
  onExit,
  onRestart,
  settings,
}: {
  playerCount: number;
  myName: string;
  aiSpeed: number;
  onExit: () => void;
  onRestart?: () => void;
  settings?: { fx?: boolean; sound?: boolean; showLog?: boolean };
}) {
  const engineRef = useRef<CorcodragonEngine | null>(null);
  const [view, setView] = useState<CorcodragonView | null>(null);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'shoot' | 'skill' | 'ult' | null>(null);
  const [showLogLocal, setShowLogLocal] = useState(settings?.showLog !== false);
  const aiSpeedRef = useRef(aiSpeed);
  aiSpeedRef.current = aiSpeed;

  const refresh = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setView(engine.getView('you'));
    setTick((v) => v + 1);
  };

  const start = () => {
    const players = [
      { id: 'you', name: myName || '你', isBot: false },
      ...Array.from({ length: Math.max(0, playerCount - 1) }, (_, i) => ({
        id: `bot${i + 1}`,
        name: BOT_NAMES[i % BOT_NAMES.length],
        isBot: true,
      })),
    ];
    engineRef.current = new CorcodragonEngine(players, {
      mode: 'ffa',
      scoreLimit: 5,
      rng: Math.random,
    });
    setPending(null);
    setError(null);
    refresh();
  };

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (playerId: string, action: CorcodragonAction) => {
    const engine = engineRef.current;
    if (!engine) return;
    const r = engine.apply(playerId, action);
    if (!r.ok) {
      setError(r.error ?? '非法操作');
    } else {
      setError(null);
    }
    setPending(null);
    refresh();
  };

  // 机器人调度
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !view) return;
    if (engine.phase !== 'playing') return;
    const current = view.players.find((p) => p.id === view.currentPlayerId);
    if (!current || !current.isBot) return;
    const botId = current.id;
    const t = setTimeout(() => {
      const botView = engine.getView(botId);
      const action = chooseAiAction(botView);
      const r = engine.apply(botId, action);
      if (!r.ok) {
        engine.apply(botId, { type: 'endTurn' });
      }
      setPending(null);
      refresh();
    }, Math.max(250, aiSpeedRef.current));
    return () => clearTimeout(t);
  }, [view]);

  if (!view) return <div className="cdf-page">加载中……</div>;

  if (view.phase === 'heroSelect') {
    return (
      <>
        <style>{CDF_CSS}</style>
        <HeroSelect view={view} onSelect={(hero) => apply('you', { type: 'selectHero', hero })} />
      </>
    );
  }

  const you = view.you;
  const hero = HERO_DEFS[you.hero];
  const showLog = showLogLocal;
  const isYourTurn = view.isYourTurn;
  const moveSet = new Set(you.moveOptions.map((c) => cellKey(c.x, c.y)));
  const dashSet = new Set(you.dashOptions.map((c) => cellKey(c.x, c.y)));

  const posMap = new Map<string, CorcodragonView['players'][number]>();
  for (const p of view.players) {
    if (p.position) posMap.set(cellKey(p.position.x, p.position.y), p);
  }

  const clickCell = (x: number, y: number) => {
    if (!isYourTurn) return;
    const key = cellKey(x, y);
    const target = posMap.get(key);

    if (pending === 'shoot') {
      if (target && target.id !== 'you') {
        apply('you', { type: 'shoot', targetId: target.id });
      }
      return;
    }
    if (pending === 'skill') {
      if (target && target.id !== 'you' && you.hero === 'guilei') {
        apply('you', { type: 'skill', targetId: target.id });
      } else if (you.hero === 'yanren') {
        if (dashSet.has(key)) apply('you', { type: 'skill', to: { x, y } });
      } else if (you.hero === 'guilei') {
        apply('you', { type: 'skill', to: { x, y } });
      }
      return;
    }
    if (pending === 'ult') {
      if (target && target.id !== 'you' && you.hero === 'yingxiao') {
        apply('you', { type: 'ult', targetId: target.id });
      } else if (you.hero === 'lingyin' || you.hero === 'guilei') {
        apply('you', { type: 'ult', to: { x, y } });
      }
      return;
    }
    // 无待选动作：点击敌人直接射击，点击高亮格移动
    if (target && target.id !== 'you' && target.visible && (target.hp ?? 0) > 0) {
      apply('you', { type: 'shoot', targetId: target.id });
      return;
    }
    if (moveSet.has(key)) {
      apply('you', { type: 'move', to: { x, y } });
    }
  };

  const togglePending = (kind: 'shoot' | 'skill' | 'ult') => {
    setPending((p) => (p === kind ? null : kind));
    setError(null);
  };

  const onSkill = () => {
    if (you.hero === 'yanren' || you.hero === 'guilei') {
      togglePending('skill');
      return;
    }
    apply('you', { type: 'skill' });
  };

  const onUlt = () => {
    if (you.hero === 'yingxiao' || you.hero === 'lingyin' || you.hero === 'guilei') {
      togglePending('ult');
      return;
    }
    apply('you', { type: 'ult' });
  };

  return (
    <div className={`cdf-page ${showLog ? '' : 'no-log'}`}>
      <style>{CDF_CSS}</style>
      <header className="cdf-topbar">
        <div className="cdf-title">🐊 鳄龙战场</div>
        <div className="cdf-chips">
          <span className="cdf-chip">回合 {view.turnNo}</span>
          <span className="cdf-chip">
            {view.mode === 'tdm' ? '团队死斗' : '自由混战'} · 先到 {view.scoreLimit} 杀
          </span>
          <span className="cdf-chip">👥 {view.players.length} 人</span>
        </div>
        <button
          className="cdf-btn ghost small"
          title={showLog ? '隐藏战报' : '显示战报'}
          onClick={() => setShowLogLocal((v) => !v)}
        >
          {showLog ? '📜' : '📕'}
        </button>
        <button className="cdf-btn ghost small" onClick={onRestart}>
          🔄
        </button>
        <button className="cdf-btn ghost small" onClick={onExit}>
          退出
        </button>
      </header>

      <main className="cdf-main">
        <div className="cdf-arena-wrap">
          <div
            className="cdf-arena"
            style={{
              gridTemplateColumns: `repeat(${ARENA_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${ARENA_SIZE}, 1fr)`,
            }}
          >
            {Array.from({ length: ARENA_SIZE * ARENA_SIZE }, (_, i) => {
              const x = i % ARENA_SIZE;
              const y = Math.floor(i / ARENA_SIZE);
              const key = cellKey(x, y);
              const player = posMap.get(key);
              const obstacle = OBSTACLES.some((o) => o.x === x && o.y === y);
              const bomb = view.bombs.find((b) => b.position.x === x && b.position.y === y);
              const inZone = view.zones.find(
                (z) => Math.max(Math.abs(x - z.center.x), Math.abs(y - z.center.y)) <= z.radius,
              );
              const isMove = moveSet.has(key) && !you.hasMoved;
              const isDash = pending === 'skill' && you.hero === 'yanren' && dashSet.has(key);
              return (
                <div
                  key={key}
                  className={[
                    'cdf-cell',
                    obstacle ? 'obstacle' : '',
                    player ? (player.id === 'you' ? 'you' : 'enemy') : '',
                    isMove ? 'move' : '',
                    isDash ? 'dash' : '',
                    inZone ? `zone-${inZone.kind}` : '',
                  ].join(' ')}
                  onClick={() => clickCell(x, y)}
                  title={player ? player.name : `(${x},${y})`}
                >
                  {player && <span className="cdf-player-dot">{HERO_DEFS[player.hero].emoji}</span>}
                  {bomb && !player && <span className="cdf-bomb">💣</span>}
                  {inZone && !player && !bomb && (
                    <span className="cdf-zone-ico">{inZone.kind === 'storm' ? '⛈️' : '🎵'}</span>
                  )}
                </div>
              );
            })}
          </div>
          {pending && (
            <div className="cdf-pending">
              已选择：{pending === 'shoot' ? '🔫 点击敌人射击' : pending === 'skill' ? '✨ 点击目标' : '🌩️ 点击目标'}
              <button className="cdf-btn ghost small" onClick={() => setPending(null)}>
                取消
              </button>
            </div>
          )}
        </div>

        <aside className="cdf-side">
          <div className="cdf-hud panel">
            <div className="cdf-you-head">
              <span className="cdf-you-emoji">{hero.emoji}</span>
              <div>
                <div className="cdf-you-name">
                  {you.name} · {hero.name}
                </div>
                <div className="cdf-you-meta">
                  {you.weapon === 'dagger' ? '∞' : `${you.mag}/${WEAPON_DEFS[you.weapon].magSize}`}
                  {' · '}
                  {you.weapon === 'dagger' ? '近战' : `备弹 ${you.reserve === Infinity ? '∞' : you.reserve}`}
                </div>
              </div>
            </div>
            <HpBar hp={you.hp} max={you.maxHp} shield={you.shieldHp} />
            <div className="cdf-bars">
              <div className="cdf-ult-bar">
                <div className="cdf-ult-fill" style={{ width: `${you.ultCharge}%` }} />
                <span className="cdf-ult-text">🌩️ {you.ultCharge}/100</span>
              </div>
            </div>
            <div className="cdf-weapons">
              {WEAPON_LIST.map((w, i) => (
                <button
                  key={w.key}
                  className={`cdf-btn weapon ${you.weapon === w.key ? 'active' : ''}`}
                  title={`${w.name}：伤害 ${w.damage} 射程 ${w.range}｜${w.desc}`}
                  onClick={() => apply('you', { type: 'switchWeapon', weapon: w.key as WeaponId })}
                >
                  {i + 1}.{w.emoji}
                </button>
              ))}
            </div>
            <div className="cdf-actions">
              <button
                className={`cdf-btn ${pending === 'shoot' ? 'active' : ''}`}
                disabled={!isYourTurn || you.hasActed}
                onClick={() => togglePending('shoot')}
              >
                🔫 射击
              </button>
              <button
                className={`cdf-btn ${pending === 'skill' ? 'active' : ''}`}
                disabled={!isYourTurn || you.hasActed || !you.skillReady}
                onClick={onSkill}
              >
                ✨ {hero.skillName}
                {you.skillCd > 0 ? `（${you.skillCd}）` : ''}
              </button>
              <button
                className={`cdf-btn ${pending === 'ult' ? 'active' : ''}`}
                disabled={!isYourTurn || you.hasActed || !you.ultReady}
                onClick={onUlt}
              >
                🌩️ {hero.ultName}
              </button>
              <button
                className="cdf-btn"
                disabled={!isYourTurn || you.hasActed || you.weapon === 'dagger'}
                onClick={() => apply('you', { type: 'reload' })}
              >
                🔃 装弹
              </button>
              <button
                className="cdf-btn primary"
                disabled={!isYourTurn}
                onClick={() => apply('you', { type: 'endTurn' })}
              >
                ⏭️ 结束回合
              </button>
            </div>
            <div className="cdf-score-line">
              击杀 {you.kills} · 助攻 {you.assists} · 死亡 {you.deaths}
            </div>
            {!isYourTurn && (
              <div className="cdf-waiting">
                ⏳ 等待{' '}
                {view.players.find((p) => p.id === view.currentPlayerId)?.name ?? '……'} 行动中
              </div>
            )}
          </div>

          {showLog && (
            <div className="cdf-log panel">
              <h3>📜 战报</h3>
              <div className="cdf-log-body">
                {view.events.map((e) => (
                  <div key={e.seq} className={`cdf-log-line ev-${e.type}`}>
                    <span className="cdf-log-icon">{EVENT_ICONS[e.type] ?? '•'}</span>
                    <span>{e.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>

      {error && <div className="cdf-error">{error}</div>}

      {view.phase === 'gameOver' && (
        <GameOver view={view} onRestart={onRestart} onExit={onExit} />
      )}
    </div>
  );
}

export function CorcodragonDetailScreen({
  playerCount,
  onPlayerCountChange,
  aiSpeed,
  onAiSpeedChange,
  onPlayLocal,
  onBack,
}: {
  playerCount: number;
  onPlayerCountChange: (n: number) => void;
  aiSpeed: number;
  onAiSpeedChange: (ms: number) => void;
  onPlayLocal: () => void;
  onBack: () => void;
}) {
  return (
    <div className="cdf-page">
      <style>{CDF_CSS}</style>
      <div className="cdf-panel cdf-detail-panel">
        <div className="cdf-detail-head">
          <span className="cdf-detail-emoji">🐊</span>
          <div>
            <h1>鳄龙战场</h1>
            <span className="cdf-detail-meta">回合制 · 本地 vs AI｜2-7 人｜5 英雄 × 4 武器</span>
          </div>
        </div>
        <p className="cdf-desc">
          英雄战术射击的回合制版本：走位、切枪、射击、释放主动技能与终极技能，
          先到 5 杀者获胜。联机模式需等服务端通用化（gameAction）后开放。
        </p>

        <section className="cdf-detail-section">
          <h2>🎮 单人 vs AI</h2>
          <div className="cdf-field">
            <span>玩家总数（其余为 AI）</span>
            <div className="cdf-count-picker">
              {Array.from({ length: 6 }, (_, i) => i + 2).map((n) => (
                <button
                  key={n}
                  className={n === playerCount ? 'cdf-btn active' : 'cdf-btn'}
                  onClick={() => onPlayerCountChange(n)}
                >
                  {n} 人
                </button>
              ))}
            </div>
          </div>
          <div className="cdf-field">
            <span>AI 行动节奏</span>
            <select
              className="cdf-select"
              value={aiSpeed}
              onChange={(e) => onAiSpeedChange(Number(e.target.value))}
            >
              {AI_SPEED_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}（{p.value}ms）
                </option>
              ))}
            </select>
          </div>
          <button className="cdf-btn primary big" onClick={onPlayLocal}>
            🎮 开始（本地 vs AI）
          </button>
        </section>

        <section className="cdf-detail-section">
          <h2>🦸 英雄</h2>
          <div className="cdf-hero-mini-grid">
            {HERO_LIST.map((h) => (
              <div key={h.key} className="cdf-hero-mini">
                <span className="cdf-hero-emoji">{h.emoji}</span>
                <b>{h.name}</b>
                <span className="cdf-muted">
                  {h.role} · HP {h.hp} · 移 {h.moveRange}
                </span>
                <span className="cdf-muted">✨ {h.skillName}</span>
                <span className="cdf-muted">🌩️ {h.ultName}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="cdf-detail-section">
          <h2>🔫 武器</h2>
          <div className="cdf-weapon-mini-grid">
            {WEAPON_LIST.map((w) => (
              <div key={w.key} className="cdf-hero-mini">
                <span className="cdf-hero-emoji">{w.emoji}</span>
                <b>{w.name}</b>
                <span className="cdf-muted">
                  伤害 {w.damage} · 射程 {w.range}
                </span>
                <span className="cdf-muted">{w.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <button className="cdf-btn ghost" onClick={onBack}>
          ← 返回游戏大厅
        </button>
      </div>
    </div>
  );
}

const CDF_CSS = `
/* 锁 100vh，禁止全局滚动；内部滚动由模块自管 */
.cdf-page { height: 100vh; width: 100vw; overflow: hidden; display: flex; flex-direction: column; background: linear-gradient(160deg, #f7f5f0 0%, #fff8e0 55%, #f7f5f0 100%); color: #4a4a4a; padding: 16px; box-sizing: border-box; font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif; }
.cdf-panel { background: rgba(255,255,255,0.65); border: 1px solid rgba(212,168,83,0.25); border-radius: 16px; padding: 20px; min-height: 0; display: flex; flex-direction: column; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 8px 32px rgba(0,0,0,0.06); }
.cdf-detail-panel { max-width: 980px; margin: 0 auto; width: 100%; max-height: 100%; overflow-y: auto; }
.cdf-detail-head { display: flex; align-items: center; gap: 16px; }
.cdf-detail-emoji { font-size: 56px; }
.cdf-detail-meta { color: #7a7a7a; }
.cdf-desc { color: #4a4a4a; line-height: 1.6; }
.cdf-detail-section { margin-top: 18px; }
.cdf-detail-section h2 { font-size: 18px; margin-bottom: 10px; color: #333; }
.cdf-field { margin: 10px 0; display: flex; flex-direction: column; gap: 6px; color: #7a7a7a; }
.cdf-count-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.cdf-select { padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.7); color: #4a4a4a; border: 1px solid rgba(212,168,83,0.3); }
.cdf-hero-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-top: 16px; }
.cdf-hero-card { text-align: left; background: rgba(255,255,255,0.7); border: 1px solid rgba(212,168,83,0.25); border-radius: 12px; padding: 12px; color: #4a4a4a; cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: all 0.2s ease; }
.cdf-hero-card:hover:not(.taken) { border-color: #d4a853; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(212,168,83,0.18); }
.cdf-hero-card.taken { opacity: 0.5; cursor: not-allowed; filter: grayscale(0.5); }
.cdf-hero-card.selected { border-color: #d4a853; background: rgba(212,168,83,0.08); box-shadow: 0 0 0 2px rgba(212,168,83,0.3); }
.cdf-hero-emoji { font-size: 34px; }
.cdf-hero-name { font-size: 18px; font-weight: 700; color: #333; }
.cdf-hero-role { color: #b8903e; font-size: 12px; font-weight: 700; }
.cdf-hero-hp { color: #7a7a7a; font-size: 12px; }
.cdf-hero-skill, .cdf-hero-ult { font-size: 12px; color: #7a7a7a; line-height: 1.4; }
.cdf-topbar { display: flex; align-items: center; gap: 10px; max-width: 1280px; margin: 0 auto 12px; flex-wrap: wrap; }
.cdf-title { font-size: 22px; font-weight: 800; margin-right: auto; color: #333; }
.cdf-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.cdf-chip { background: rgba(255,255,255,0.65); border: 1px solid rgba(212,168,83,0.25); border-radius: 999px; padding: 4px 10px; font-size: 12px; color: #4a4a4a; }
.cdf-main { display: flex; gap: 14px; max-width: 1280px; width: 100%; margin: 0 auto; align-items: stretch; flex: 1; min-height: 0; }
.cdf-arena-wrap { flex: 1; min-width: 300px; min-height: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.cdf-arena { display: grid; gap: 3px; background: rgba(255,255,255,0.5); border: 1px solid rgba(212,168,83,0.3); border-radius: 12px; padding: 8px; aspect-ratio: 1; width: 100%; max-height: 100%; }
.cdf-cell { position: relative; background: rgba(255,255,255,0.85); border-radius: 6px; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: default; transition: background 0.15s; }
.cdf-cell.obstacle { background: rgba(180,160,120,0.4); border: 1px solid rgba(120,100,60,0.3); cursor: not-allowed; }
.cdf-cell.you { background: rgba(212,168,83,0.4); border: 1px solid rgba(212,168,83,0.6); }
.cdf-cell.enemy { background: rgba(192,57,43,0.2); border: 1px solid rgba(192,57,43,0.4); }
.cdf-cell.move { outline: 3px solid #38bdf8; cursor: pointer; }
.cdf-cell.dash { outline: 3px solid #d4a853; cursor: pointer; }
.cdf-cell.zone-storm { background: rgba(168,85,247,0.25); }
.cdf-cell.zone-sound { background: rgba(90,143,92,0.3); }
.cdf-player-dot { font-size: 18px; }
.cdf-bomb { font-size: 16px; }
.cdf-zone-ico { font-size: 12px; opacity: 0.8; }
.cdf-pending { margin-top: 10px; background: rgba(255,255,255,0.6); border: 1px dashed rgba(212,168,83,0.5); border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; gap: 10px; color: #4a4a4a; }
.cdf-side { width: 340px; min-width: 0; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }
.cdf-hud { display: flex; flex-direction: column; gap: 10px; }
.cdf-you-head { display: flex; align-items: center; gap: 10px; }
.cdf-you-emoji { font-size: 40px; }
.cdf-you-name { font-weight: 800; color: #333; }
.cdf-you-meta { color: #7a7a7a; font-size: 12px; }
.cdf-hp-wrap { display: flex; align-items: center; gap: 8px; }
.cdf-hp-bar { flex: 1; height: 14px; background: rgba(0,0,0,0.08); border-radius: 999px; overflow: hidden; }
.cdf-hp-fill { height: 100%; background: linear-gradient(90deg, #5a8f5c, #88b890); transition: width 0.2s; }
.cdf-hp-text { font-size: 12px; color: #4a4a4a; white-space: nowrap; }
.cdf-bars { display: flex; flex-direction: column; gap: 6px; }
.cdf-ult-bar { position: relative; height: 16px; background: rgba(0,0,0,0.08); border-radius: 999px; overflow: hidden; }
.cdf-ult-fill { height: 100%; background: linear-gradient(90deg, #d4a853, #b8903e); transition: width 0.2s; }
.cdf-ult-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #5a4015; font-weight: 700; }
.cdf-weapons { display: flex; gap: 8px; flex-wrap: wrap; }
.cdf-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cdf-btn { background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.1); border-radius: 10px; padding: 8px 12px; color: #4a4a4a; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s ease; }
.cdf-btn:hover:not(:disabled) { border-color: #d4a853; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(212,168,83,0.18); }
.cdf-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cdf-btn.primary { background: linear-gradient(135deg, #d4a853, #b8903e); border-color: #b8903e; font-weight: 700; color: #fff; box-shadow: 0 4px 12px rgba(212,168,83,0.3); }
.cdf-btn.primary:hover:not(:disabled) { filter: brightness(1.08); box-shadow: 0 6px 18px rgba(212,168,83,0.45); }
.cdf-btn.ghost { background: transparent; }
.cdf-btn.small { padding: 4px 8px; font-size: 12px; }
.cdf-btn.big { width: 100%; padding: 12px; font-size: 16px; }
.cdf-btn.active { border-color: #d4a853; box-shadow: 0 0 0 2px rgba(212,168,83,0.3); }
.cdf-score-line { color: #4a4a4a; font-size: 13px; }
.cdf-waiting { color: #b8903e; font-size: 13px; }
.cdf-log { max-height: 280px; overflow: hidden; display: flex; flex-direction: column; }
.cdf-log h3 { margin: 0 0 8px; font-size: 15px; color: #333; }
.cdf-log-body { overflow-y: auto; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4a4a4a; }
.cdf-log-line { display: flex; gap: 6px; padding: 3px 6px; border-radius: 6px; background: rgba(255,255,255,0.4); }
.cdf-log-icon { flex: none; }
.cdf-error { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); background: rgba(192,57,43,0.9); border: 1px solid rgba(192,57,43,0.5); border-radius: 10px; padding: 8px 14px; color: #fff; box-shadow: 0 8px 24px rgba(192,57,43,0.3); }
.cdf-overlay { position: fixed; inset: 0; background: rgba(247,245,240,0.85); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 30; }
.cdf-result-panel { width: 420px; max-width: calc(100vw - 32px); text-align: center; padding: 28px 32px; }
.cdf-rankings { list-style: none; padding: 0; margin: 12px 0; text-align: left; display: flex; flex-direction: column; gap: 6px; }
.cdf-rankings li { display: grid; grid-template-columns: 30px 1fr 70px 70px 70px 70px; background: rgba(255,255,255,0.6); border: 1px solid rgba(212,168,83,0.2); border-radius: 8px; padding: 8px 10px; align-items: center; color: #4a4a4a; }
.cdf-rank-no { font-weight: 800; color: #b8903e; }
.cdf-rank-name { font-weight: 700; color: #333; }
.cdf-rank-stat { color: #7a7a7a; font-size: 12px; }
.cdf-rank-score { text-align: right; font-weight: 700; color: #b8903e; }
.cdf-row { display: flex; gap: 10px; justify-content: center; margin-top: 14px; }
.cdf-tagline { color: #7a7a7a; }
.cdf-hero-mini-grid, .cdf-weapon-mini-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.cdf-hero-mini { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.cdf-muted { color: #94a3b8; font-size: 12px; }
@media (max-width: 900px) { .cdf-main { flex-direction: column; } .cdf-side { width: 100%; } }
`;
