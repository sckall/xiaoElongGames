import { expect, it } from 'vitest';
import { Game } from '../src/engine';
import { chooseAiAction } from '../src/ai';
import { MAX_HP, TOTAL_CARDS } from '../src/types';

/** 可复现随机（消除 Math.random 导致的偶发超时 flake） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 模糊测试：大量随机完整对局。
 * 验证：游戏能在有限步内结束、卡牌总数守恒、血量/手牌边界合法。
 */
it('60 局随机 AI 对局：能结束、卡牌守恒、数值合法', () => {
  for (let gi = 0; gi < 60; gi++) {
    const n = 2 + (gi % 4); // 2~5 人
    const players = Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      isBot: true,
    }));
    const game = new Game({ players, rng: mulberry32(1000 + gi) });
    let steps = 0;
    const MAX_STEPS = 10000;
    while (game.phase !== 'gameOver' && steps < MAX_STEPS) {
      steps++;
      if (game.phase === 'roundEnd') {
        // 轮末守恒检查：36 张牌必须全部在场
        const inHands = game.players.reduce((s, p) => s + p.hand.length, 0);
        const inSecrets = game.players.reduce((s, p) => s + p.secrets.length, 0);
        expect(game.deck.length + game.secretPile.length + game.discard.length + inHands + inSecrets).toBe(TOTAL_CARDS);
        for (const p of game.players) {
          expect(p.hp).toBeGreaterThanOrEqual(0);
          expect(p.hp).toBeLessThanOrEqual(MAX_HP);
          expect(p.hand.length).toBeLessThanOrEqual(5);
        }
        game.nextRound();
        continue;
      }
      const p = game.current;
      const view = game.getView(p.id);
      const a = chooseAiAction(view, { risk: 0.15, rng: mulberry32(2000 + gi) });
      if (a.type === 'declare') game.declareSpell(p.id, a.magic);
      else game.endTurn(p.id);
    }
    expect(steps).toBeLessThan(MAX_STEPS);
    expect(game.phase).toBe('gameOver');
    expect(game.winnerId).not.toBeNull();
    for (const p of game.players) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.hp).toBeGreaterThanOrEqual(0);
      expect(p.hp).toBeLessThanOrEqual(MAX_HP);
    }
  }
});
