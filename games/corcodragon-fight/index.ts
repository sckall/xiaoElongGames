/**
 * 《鳄龙咆哮》GameModule 描述符：注册到平台游戏注册表。
 * - 引擎/AI 零依赖（engine.ts / ai.ts / defs.ts），服务端直接 import 本入口；
 * - 3D 客户端在 ./GameUI.tsx（Three.js），平台经子路径 import，避免服务端打包 React。
 */
import { createEngine } from './engine';
import { chooseAIInputs } from './ai';
import { GAME_ID, GAME_NAME } from './defs';
import type { GameModule, PlayerConfig, RealtimeGameEngine } from '../types';

export const corcodragonFightModule: GameModule = {
  id: GAME_ID,
  name: GAME_NAME,
  emoji: '🐊',
  mode: 'realtime',
  minPlayers: 2,
  maxPlayers: 7,
  description: '3D 实时英雄射击：5 位鳄龙英雄 × 4 种武器，20Hz 服务端权威联机对战。',
  available: false,
  createRealtimeEngine(players: PlayerConfig[], options?: unknown, rng?: () => number): RealtimeGameEngine {
    return createEngine(players, options, rng);
  },
  createAI(view: unknown): unknown {
    return chooseAIInputs(view as Parameters<typeof chooseAIInputs>[0]);
  },
};

export * from './defs';
export * from './engine';
export * from './ai';
