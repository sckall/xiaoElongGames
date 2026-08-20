/**
 * 平台层与游戏层的契约：每个游戏实现一个 GameModule。
 *
 * 平台（大厅/房间/连接/协议）负责：建房、房间码/密码、座位、托管策略、
 * 断线重连、空房回收、房间列表。
 * 游戏作者只需实现：规则引擎（动作 + 按玩家视角投影）、AI、描述符；
 * 对局 UI 在平台侧（apps/web）按 gameId 绑定。
 *
 * 注意：本文件不依赖 react 与任何具体游戏包，契约保持自包含。
 */

/** 玩家座位配置（平台传入；id 全局唯一） */
export interface PlayerConfig {
  id: string;
  name: string;
  isBot?: boolean;
}

export type GameMode = 'turn-based' | 'async' | 'realtime';

/** 规则引擎的最小契约：状态 + 动作 + 按玩家视角投影 */
export interface GameEngine {
  /** 对局阶段（游戏自定字符串语义） */
  phase: string;
  /** 以指定玩家视角投影状态（隐藏其不可见信息）；平台原样下发给该玩家 */
  getView(playerId: string): unknown;
  /** 应用一个动作；返回 {ok} 或 {ok:false,error}，非法输入必须安全拒绝 */
  apply(playerId: string, action: unknown): { ok: boolean; error?: string };
}

/**
 * 实时（FPS/动作）引擎契约：服务端权威 tick 模拟 + 高频输入 + 按玩家视角快照。
 * 平台负责 tick 循环与快照广播；引擎只负责：推进一帧、校验输入、投影快照。
 * 断线托管语义由平台调用方决定（站桩 / 移除 / 转 AI），引擎不感知连接状态。
 */
export interface RealtimeGameEngine {
  /** 对局阶段（游戏自定字符串语义，如 heroSelect/playing/gameOver） */
  phase: string;
  /** 推进一帧（dtMs 为真实流逝毫秒，引擎内部按固定步长切分；dtMs 需为有限值） */
  tick(dtMs: number): void;
  /** 应用一个输入动作；返回 {ok} 或 {ok:false,error}，非法输入必须安全拒绝 */
  applyInput(playerId: string, input: unknown): { ok: boolean; error?: string };
  /** 以指定玩家视角投影快照（隐藏其不可见信息）；平台原样下发给该玩家 */
  getSnapshot(playerId: string): unknown;
}

export interface GameModule {
  id: string;
  name: string;
  emoji: string;
  /** 大厅展示与平台能力分配：回合制/异步/同步低延迟 */
  mode: GameMode;
  minPlayers: number;
  maxPlayers: number;
  /** 一句话介绍（大厅卡片） */
  description: string;
  /** 回合制/异步：创建一局游戏（玩家座位顺序即传入顺序） */
  createEngine?(players: PlayerConfig[], rng?: () => number): GameEngine;
  /** 实时：创建服务端权威 tick 引擎（options 由游戏自定并自行校验） */
  createRealtimeEngine?(
    players: PlayerConfig[],
    options?: unknown,
    rng?: () => number,
  ): RealtimeGameEngine;
  /** AI 决策：只用 getView/getSnapshot 视角信息，返回发给 apply/applyInput 的动作 */
  createAI?(view: unknown, options?: unknown): unknown;
  /** 是否已上线 */
  available: boolean;
}
