/**
 * AI 决策：严格使用「该玩家视角」的信息推理自己的手牌概率。
 * 与真实玩家一致：看不到自己的手牌，但能看到他人手牌、弃牌堆、
 * 自己的秘密牌，以及牌堆/秘密牌堆的剩余数量。
 *
 * 核心：超几何分布推理 P(某魔法至少一张在手)。
 * 未知池 = 自己的手牌 + 牌堆 + 秘密牌堆 + 他人秘密牌；
 * 已知池 = 他人手牌 + 弃牌堆 + 自己的秘密牌。
 */
import { MAGIC_DEFS, MAGIC_LIST, MAX_HP, type Magic, type PlayerView, type SeatView } from './types';

export type AiAction = { type: 'declare'; magic: Magic } | { type: 'end' };

export interface AiOptions {
  /** 期望收益门槛：越高越保守（只放很有把握的魔法） */
  risk?: number;
  /** 结果抖动，避免每局完全相同 */
  jitter?: number;
  /** 可注入随机数（测试/回放） */
  rng?: () => number;
}

/** 超几何推理：某魔法至少一张在自己手牌中的概率 */
export function probMagicInHand(view: PlayerView, magic: Magic): number {
  const you = view.seats.find((s) => s.id === view.youId);
  if (!you) return 0;
  const h = you.handCount;
  if (h === 0) return 0;

  const known: Record<Magic, number> = Object.fromEntries(
    MAGIC_LIST.map((d) => [d.key, 0]),
  ) as Record<Magic, number>;
  for (const s of view.seats) {
    if (s.id === view.youId) {
      for (const m of s.secrets) if (m) known[m]++;
    } else {
      for (const m of s.hand) if (m) known[m]++;
      // 他人秘密牌身份未知 → 计入未知池
    }
  }
  for (const m of view.discard) known[m]++;

  let pool = h + view.deckCount + view.secretPileCount;
  for (const s of view.seats) {
    if (s.id !== view.youId) pool += s.secretCount;
  }

  const unseen = Math.max(0, MAGIC_DEFS[magic].count - known[magic]);
  if (unseen === 0) return 0;
  let q = 1;
  for (let i = 0; i < h; i++) {
    const denom = pool - i;
    if (denom <= 0) return 1;
    const num = pool - unseen - i;
    if (num <= 0) return 1;
    q *= num / denom;
  }
  return 1 - q;
}

export function chooseAiAction(view: PlayerView, opts: AiOptions = {}): AiAction {
  const risk = opts.risk ?? 0.25;
  const jitter = opts.jitter ?? 0.12;
  const rng = opts.rng ?? Math.random;
  const you = view.seats.find((s) => s.id === view.youId);
  if (!you || you.handCount === 0) return { type: 'end' };

  // ---- 收益估计 ----
  const idx = view.seats.findIndex((s) => s.id === view.youId);
  const n = view.seats.length;
  const prev = view.seats[(idx - 1 + n) % n];
  const next = view.seats[(idx + 1) % n];
  const others = view.seats.filter((s) => s.id !== view.youId);
  const missingHp = MAX_HP - you.hp;

  const killBonus = (seat: SeatView, dmg: number): number =>
    seat.alive && seat.hp - dmg <= 0 ? 2.5 : 0;

  const gainOf = (magic: Magic): number => {
    switch (magic) {
      case 'potion':
        return you.hp < MAX_HP ? 0.9 : 0.15;
      case 'dream': {
        const expected = Math.min(2, missingHp);
        return expected > 0 ? expected * 0.9 : 0.3;
      }
      case 'fire':
        return 1 + killBonus(next, 1);
      case 'blizzard':
        return 1 + killBonus(prev, 1);
      case 'storm': {
        if (n === 2) return 2 + killBonus(next, 2);
        return 2 + killBonus(prev, 1) + killBonus(next, 1);
      }
      case 'ghost': {
        let g = others.length;
        for (const o of others) g += killBonus(o, 1);
        if (you.hp < MAX_HP) g += 0.6;
        return g;
      }
      case 'dragon': {
        let g = others.length * 2;
        for (const o of others) g += killBonus(o, 2);
        return g;
      }
      case 'owl':
        return view.secretPileCount > 0 ? 1.2 : 0.05;
    }
  };

  const failCostOf = (magic: Magic): number => {
    const expected = magic === 'dragon' ? 2 : 1;
    let cost = expected;
    if (you.hp <= expected) cost += 3; // 可能直接自杀 → 代价巨大
    return cost;
  };

  // ---- 在合法魔法中挑最优 ----
  const legal = MAGIC_LIST.filter((d) => view.legalMagics.includes(d.key));
  if (legal.length === 0) return { type: 'end' };

  let best: Magic | null = null;
  let bestEv = -Infinity;
  for (const d of legal) {
    const p = probMagicInHand(view, d.key);
    const ev = p * gainOf(d.key) - (1 - p) * failCostOf(d.key) + (rng() - 0.5) * jitter;
    if (ev > bestEv) {
      bestEv = ev;
      best = d.key;
    }
  }
  if (best === null || bestEv <= risk) return { type: 'end' };
  return { type: 'declare', magic: best };
}
