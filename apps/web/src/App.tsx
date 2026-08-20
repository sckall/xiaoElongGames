/**
 * App 入口：仅承担 Provider 装配 + 路由表。
 * 状态与路由逻辑全部在 ./router.tsx，便于阅读和维护。
 */

import { GameStateProvider, AppRoutes } from './router';

export default function App() {
  return (
    <GameStateProvider>
      <AppRoutes />
    </GameStateProvider>
  );
}
