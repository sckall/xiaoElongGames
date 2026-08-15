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
  /** 创建一局游戏（玩家座位顺序即传入顺序） */
  createEngine(players: PlayerConfig[], rng?: () => number): GameEngine;
  /** AI 决策：只用 getView 视角信息，返回发给 apply 的动作 */
  createAI?(view: unknown, options?: unknown): unknown;
  /** 是否已上线 */
  available: boolean;
}
