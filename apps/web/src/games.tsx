/**
 * 平台侧游戏注册表：把 games/* 的游戏模块与平台 UI 绑定。
 * 新游戏接入：在下方 import 其模块并加入 GAMES；UI 绑定在 App 路由中按 gameId 分发。
 */
import { troubleMagicianModule } from '@tm/game-trouble-magician';
import { corcodragonFireModule } from '@tm/game-corcodragon-fire';
import type { GameModule } from '../../../games/types';

export const GAMES: GameModule[] = [troubleMagicianModule, corcodragonFireModule];

export function getGame(id: string): GameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
