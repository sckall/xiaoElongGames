export interface GameSettings {
  fx: boolean;
  sound: boolean;
  /** 本地模式 AI 行动节奏（毫秒） */
  aiSpeed: number;
  /** 联机服务器地址（空 = 同源自动） */
  serverUrl: string;
}

export const AI_SPEED_PRESETS = [
  { value: 500, label: '很快' },
  { value: 1000, label: '正常' },
  { value: 2000, label: '悠闲' },
  { value: 3500, label: '慢节奏' },
];

export const DEFAULT_SETTINGS: GameSettings = {
  fx: true,
  sound: true,
  aiSpeed: 1000,
  serverUrl: '',
};
