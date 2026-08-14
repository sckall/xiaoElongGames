import { useLocalGame } from './useLocalGame';
import GameTable from './GameTable';
import type { GameSettings } from './GameSettings';

export default function LocalGameScreen({
  playerCount,
  myName,
  settings,
  onExit,
  onRestart,
  onToggleSound,
  onToggleFx,
}: {
  playerCount: number;
  myName: string;
  settings: GameSettings;
  onExit: () => void;
  onRestart: () => void;
  onToggleSound: () => void;
  onToggleFx: () => void;
}) {
  const api = useLocalGame(playerCount, myName, settings.aiSpeed);
  return (
    <GameTable
      api={{ ...api, autoRound: false }}
      settings={settings}
      onExit={onExit}
      onRematch={onRestart}
      onToggleSound={onToggleSound}
      onToggleFx={onToggleFx}
    />
  );
}
