/**
 * 出包魔法师游戏描述符：注册到平台游戏注册表。
 * 本包只含引擎适配与描述符（引擎本体在 @tm/rules）；对局 UI 由平台侧绑定。
 */
import { Game, chooseAiAction } from '@tm/rules';
import type { GameEngine, GameModule, PlayerConfig } from '../types';

/** 把现有 Game 类适配为平台 GameEngine 契约 */
class TroubleMagicianEngine implements GameEngine {
  phase = 'playing';
  constructor(private game: Game) {}

  getView(playerId: string): unknown {
    return this.game.getView(playerId);
  }

  apply(playerId: string, action: unknown): { ok: boolean; error?: string } {
    const a = action as { type?: string; magic?: string };
    if (!a || typeof a.type !== 'string') return { ok: false, error: '非法动作' };
    switch (a.type) {
      case 'declareSpell':
        return this.game.declareSpell(playerId, a.magic as never);
      case 'endTurn':
        return this.game.endTurn(playerId);
      case 'nextRound':
        return this.game.nextRound();
      default:
        return { ok: false, error: `未知动作 ${a.type}` };
    }
  }
}

export const troubleMagicianModule: GameModule = {
  id: 'trouble-magician',
  name: '出包魔法师',
  emoji: '🧙',
  mode: 'turn-based',
  minPlayers: 2,
  maxPlayers: 5,
  description: '见习魔法师瞎放魔法的欢乐桌游：看不到自己的手牌，喊错魔法就出包！',
  available: true,
  createEngine(players: PlayerConfig[], rng?: () => number) {
    return new TroubleMagicianEngine(new Game({ players, rng }));
  },
  createAI(view) {
    return chooseAiAction(view as Parameters<typeof chooseAiAction>[0]);
  },
};
