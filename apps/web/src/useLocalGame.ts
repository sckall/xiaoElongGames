import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, chooseAiAction, type Magic, type PlayerView } from '@tm/rules';

const BOT_NAMES = ['阿呆', '梅林', '小圆', '老巴'];
/** 每个 AI 座位的性格参数（风险门槛） */
const BOT_RISKS = [0.15, 0.28, 0.42, 0.55];

export interface LocalGameApi {
  view: PlayerView | null;
  start: () => void;
  declare: (magic: Magic) => void;
  endTurn: () => void;
  advanceRound: () => void;
}

export function useLocalGame(playerCount: number, myName: string, aiSpeed: number): LocalGameApi {
  const gameRef = useRef<Game | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [, setVersion] = useState(0);
  const aiSpeedRef = useRef(aiSpeed);
  aiSpeedRef.current = aiSpeed;

  const refresh = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setView({ ...g.getView('you') });
    setVersion((v) => v + 1);
  }, []);

  const start = useCallback(() => {
    const players = [
      { id: 'you', name: myName || '你', isBot: false },
      ...Array.from({ length: playerCount - 1 }, (_, i) => ({
        id: `bot${i + 1}`,
        name: BOT_NAMES[i] ?? `机器人${i + 1}`,
        isBot: true,
      })),
    ];
    gameRef.current = new Game({ players });
    refresh();
  }, [playerCount, myName, refresh]);

  const declare = useCallback(
    (magic: Magic) => {
      const g = gameRef.current;
      if (!g) return;
      const r = g.declareSpell('you', magic);
      if (!r.ok) return;
      refresh();
    },
    [refresh],
  );

  const endTurn = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const r = g.endTurn('you');
    if (!r.ok) return;
    refresh();
  }, [refresh]);

  const advanceRound = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.nextRound();
    refresh();
  }, [refresh]);

  // 调度：AI 回合（节奏由设置决定；轮末由玩家手动开始下一轮）
  useEffect(() => {
    const g = gameRef.current;
    if (!g || !view) return;
    if (g.phase === 'gameOver' || g.phase === 'roundEnd') return;
    if (g.current.isBot) {
      const botId = g.current.id;
      const idx = g.players.findIndex((p) => p.id === botId);
      const risk = BOT_RISKS[Math.max(0, idx - 1)] ?? 0.3;
      const t = setTimeout(
        () => {
          const a = chooseAiAction(g.getView(botId), { risk });
          if (a.type === 'declare') g.declareSpell(botId, a.magic);
          else g.endTurn(botId);
          refresh();
        },
        Math.max(300, aiSpeedRef.current),
      );
      return () => clearTimeout(t);
    }
  }, [view, refresh]);

  return { view, start, declare, endTurn, advanceRound };
}
