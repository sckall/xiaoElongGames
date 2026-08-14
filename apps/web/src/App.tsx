import { useState } from 'react';
import { MAGIC_LIST, MAX_PLAYERS, MIN_PLAYERS } from '@tm/rules';
import GameScreen from './GameScreen';

export default function App() {
  const [screen, setScreen] = useState<'setup' | 'game'>('setup');
  const [playerCount, setPlayerCount] = useState(4);
  const [myName, setMyName] = useState('你');
  const [sessionKey, setSessionKey] = useState(0);

  if (screen === 'game') {
    return (
      <GameScreen
        key={sessionKey}
        playerCount={playerCount}
        myName={myName}
        onExit={() => setScreen('setup')}
        onRestart={() => setSessionKey((k) => k + 1)}
      />
    );
  }

  return (
    <div className="page setup-page">
      <div className="panel setup-panel">
        <h1>
          🧙 出包魔法师 <span className="subtitle">Trouble Magician</span>
        </h1>
        <p className="tagline">连自己会什么魔法都不知道的见习魔法师们，开始瞎放魔法吧！</p>

        <label className="field">
          <span>你的名字</span>
          <input
            value={myName}
            maxLength={8}
            onChange={(e) => setMyName(e.target.value)}
          />
        </label>

        <div className="field">
          <span>玩家总数（其余为 AI）</span>
          <div className="count-picker">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(
              (n) => (
                <button
                  key={n}
                  className={n === playerCount ? 'count-btn active' : 'count-btn'}
                  onClick={() => setPlayerCount(n)}
                >
                  {n} 人
                </button>
              ),
            )}
          </div>
        </div>

        <button className="primary-btn big" onClick={() => { setSessionKey((k) => k + 1); setScreen('game'); }}>
          🎮 开始游戏
        </button>

        <details className="rules">
          <summary>📜 规则速览</summary>
          <ul>
            <li>共 36 张魔法牌、8 种魔法，每种 1~8 张不等。</li>
            <li>你的手牌背对自己：你看不到自己的牌，但能看到所有人的牌。</li>
            <li>轮到你说出一个魔法名：有 → 打出并生效，可继续施法（但不能比上一张更稀有）；没有 → 出包！扣 1 生命并结束回合（巨龙失败扣 1~3）。</li>
            <li>回合结束补牌到 5 张。生命上限 6，每轮开始重置。</li>
            <li>一轮结束：击杀他人 +3（存活者 +1）；放完所有魔法 +3；自杀则其他人 +1。猫头鹰秘密牌存活时每张再 +1。</li>
            <li>先到 8 分且分数最高者获胜。</li>
          </ul>
          <div className="magic-list">
            {MAGIC_LIST.map((m) => (
              <div key={m.key} className="magic-line">
                <span className="magic-emoji">{m.emoji}</span>
                <span className="magic-name">{m.name} ×{m.count}</span>
                <span className="magic-desc">{m.desc}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
