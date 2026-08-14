import { useRemoteGame } from './useRemoteGame';
import LobbyScreen from './LobbyScreen';
import GameTable from './GameTable';
import type { GameSettings } from './GameSettings';

export default function OnlineScreen({
  settings,
  defaultName,
  onExit,
  onToggleSound,
  onToggleFx,
}: {
  settings: GameSettings;
  defaultName: string;
  onExit: () => void;
  onToggleSound: () => void;
  onToggleFx: () => void;
}) {
  const remote = useRemoteGame();

  if (remote.stage === 'playing' && remote.view) {
    return (
      <GameTable
        api={{
          view: remote.view,
          start: () => {},
          declare: remote.declare,
          endTurn: remote.endTurn,
          advanceRound: () => {},
          autoRound: true,
        }}
        settings={settings}
        onExit={remote.leave}
        onToggleSound={onToggleSound}
        onToggleFx={onToggleFx}
      />
    );
  }

  return <LobbyScreen remote={remote} defaultName={defaultName} onExit={onExit} />;
}
