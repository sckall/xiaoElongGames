/**
 * 《鳄龙咆哮》GameModule 描述符：注册到平台游戏注册表。
 * 引擎与 AI 均在本包内实现（零依赖，可直接单测）。
 */
import { CorcodragonEngine, CorcodragonGameEngine } from './engine';
import { chooseAiAction } from './ai';
import type { GameEngine, GameModule, PlayerConfig } from '../types';

export const corcodragonFireModule: GameModule = {
  id: 'corcodragon-fire',
  name: '鳄龙咆哮',
  emoji: '🐊',
  mode: 'turn-based',
  minPlayers: 2,
  maxPlayers: 7,
  description: '2-7 人回合制英雄战术射击：5 位英雄 × 4 种武器，走位、射击、技能与终极技一决高下。',
  available: true,
  createEngine(players: PlayerConfig[], rng?: () => number): GameEngine {
    return new CorcodragonGameEngine(
      new CorcodragonEngine(players, { mode: 'ffa', scoreLimit: 5, rng }),
    );
  },
  createAI(view: unknown): unknown {
    return chooseAiAction(view as Parameters<typeof chooseAiAction>[0]);
  },
};

export * from './engine';
export * from './ai';
