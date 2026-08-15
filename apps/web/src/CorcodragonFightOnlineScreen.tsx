/**
 * 《鳄龙咆哮》联机入口：大厅 ↔ 对局。
 * - 大厅：RealtimeLobbyScreen（房间/密码/AI/开始）；
 * - 对局：FpsGameView + useRealtimeGame 的 rtInput/rtSnapshot driver。
 */
import { useRealtimeGame } from './useRealtimeGame';
import RealtimeLobbyScreen from './RealtimeLobbyScreen';
import { FpsGameView, type FightConfig } from '@tm/game-corcodragon-fight/GameUI';
import type { GameSettings } from './GameSettings';

export default function CorcodragonFightOnlineScreen({
  settings,
  defaultName,
  config,
  onExit,
  onServerUrlChange,
}: {
  settings: GameSettings;
  defaultName: string;
  config: FightConfig;
  onExit: () => void;
  onServerUrlChange: (url: string) => void;
}) {
  const remote = useRealtimeGame(settings.serverUrl);

  if (remote.stage === 'playing' && remote.snapshot) {
    return (
      <FpsGameView
        driver={{
          snapshot: remote.snapshot,
          myId: remote.myId,
          online: true,
          error: remote.error,
          send: remote.sendInput,
          onExit: () => {
            remote.leave();
            onExit();
          },
        }}
      />
    );
  }

  return (
    <RealtimeLobbyScreen
      remote={remote}
      defaultName={defaultName}
      serverUrl={settings.serverUrl}
      config={config}
      onServerUrlChange={onServerUrlChange}
      onExit={onExit}
    />
  );
}
