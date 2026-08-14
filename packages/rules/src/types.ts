/**
 * 《出包魔法师》规则常量与类型定义。
 * 规格依据仓库根目录的《出包魔法师桌游基本规则.md》。
 */

export const MAGICS = [
  'dragon',
  'ghost',
  'dream',
  'owl',
  'storm',
  'blizzard',
  'fire',
  'potion',
] as const;

export type Magic = (typeof MAGICS)[number];

export interface MagicDef {
  key: Magic;
  name: string;
  emoji: string;
  count: number;
  desc: string;
}

export const MAGIC_DEFS: Record<Magic, MagicDef> = {
  dragon: {
    key: 'dragon',
    name: '古代巨龙',
    emoji: '🐉',
    count: 1,
    desc: '其他玩家 -1~3 生命',
  },
  ghost: {
    key: 'ghost',
    name: '黑暗幽灵',
    emoji: '👻',
    count: 2,
    desc: '其他玩家 -1 生命，自己 +1 生命',
  },
  dream: {
    key: 'dream',
    name: '甜蜜的梦',
    emoji: '💕',
    count: 3,
    desc: '自己 +1~3 生命',
  },
  owl: {
    key: 'owl',
    name: '猫头鹰',
    emoji: '🦉',
    count: 4,
    desc: '获取 1 张秘密牌，存活时每张 +1 分',
  },
  storm: {
    key: 'storm',
    name: '闪电暴风雨',
    emoji: '⛈️',
    count: 5,
    desc: '上家和下家各 -1 生命',
  },
  blizzard: {
    key: 'blizzard',
    name: '暴风雪',
    emoji: '🌨️',
    count: 6,
    desc: '上家 -1 生命',
  },
  fire: {
    key: 'fire',
    name: '火球',
    emoji: '🔥',
    count: 7,
    desc: '下家 -1 生命',
  },
  potion: {
    key: 'potion',
    name: '魔法药水',
    emoji: '🧪',
    count: 8,
    desc: '自己 +1 生命',
  },
};

/** 按稀有度（张数从小到大）排序的魔法列表 */
export const MAGIC_LIST: MagicDef[] = MAGICS.map((k) => MAGIC_DEFS[k]);

export const TOTAL_CARDS = 36;
export const HAND_SIZE = 5;
export const MAX_HP = 6;
export const WIN_SCORE = 8;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

/** 秘密牌数量：2 人 12 张，3 人 6 张，4/5 人 4 张 */
export function secretCountFor(playerCount: number): number {
  if (playerCount === 2) return 12;
  if (playerCount === 3) return 6;
  return 4;
}

export interface Card {
  id: string;
  magic: Magic;
}

export interface PlayerConfig {
  id: string;
  name: string;
  isBot?: boolean;
}

export type EffectType =
  | 'roundStart'
  | 'turnStart'
  | 'cast'
  | 'dice'
  | 'damage'
  | 'heal'
  | 'owl'
  | 'fail'
  | 'draw'
  | 'turnEnd'
  | 'roundEnd'
  | 'gameOver'
  | 'info';

export interface EffectEvent {
  type: EffectType;
  /** 事件序号，供 React 等渲染层做 key */
  seq: number;
  playerId?: string;
  targetId?: string;
  magic?: Magic;
  amount?: number;
  text: string;
}

export type RoundEndKind = 'all-cast' | 'kill' | 'suicide';

export interface RoundResult {
  kind: RoundEndKind;
  winnerId?: string;
  victimId?: string;
  /** 本轮每个玩家获得的分数（含猫头鹰加成） */
  points: Record<string, number>;
  text: string;
}

export interface SeatView {
  id: string;
  name: string;
  isBot: boolean;
  hp: number;
  score: number;
  alive: boolean;
  handCount: number;
  /** 自己的手牌为 null（背对自己），他人的手牌公开 */
  hand: (Magic | null)[];
  secretCount: number;
  /** 自己的秘密牌对本人可见，他人秘密牌为 null */
  secrets: (Magic | null)[];
}

export interface PlayerView {
  round: number;
  turnNo: number;
  phase: 'playing' | 'roundEnd' | 'gameOver';
  youId: string;
  currentPlayerId: string | null;
  seats: SeatView[];
  deckCount: number;
  secretPileCount: number;
  /** 弃牌堆（公开信息，用于推理自己手牌） */
  discard: Magic[];
  /** 本回合已施放的上一张魔法（下一张不能更稀有） */
  lastMagic: Magic | null;
  events: EffectEvent[];
  roundResult: RoundResult | null;
  winnerId: string | null;
  isYourTurn: boolean;
  /** 当前回合玩家可合法施放的魔法（下一张总张数不能小于上一张） */
  legalMagics: Magic[];
  /**
   * 每个魔法在本玩家视角的「剩余」张数：
   * 总张数 - 本视角可见明牌（他人手牌 + 弃牌堆 + 自己的秘密牌）。
   * 因看不到自己的手牌，不同玩家的数值不同；
   * 等价于该魔法仍在【自己手牌 ∪ 牌堆 ∪ 秘密牌堆 ∪ 他人秘密牌】中的张数。
   */
  magicRemaining: Record<Magic, number>;
}
