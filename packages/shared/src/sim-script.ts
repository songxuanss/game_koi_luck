/**
 * 确定性模拟事件剧本：无真实直播间时驱动一局完整演示（demo 模式 / 联调 / 压测）。
 * 同一参数永远生成同一事件序列。
 */
import type { LiveEvent, Tier } from './live-events';
import { mulberry32, pickWeighted } from './prng';

export interface SimOptions {
  seed: number;
  roomId: string;
  startTs: number;
  durationMs: number;
  /** 模拟观众数。 */
  audience: number;
  /** 每秒平均事件数。 */
  eventsPerSec: number;
  /** 礼物在事件中的占比（0~1）。 */
  giftRatio: number;
}

export const DEFAULT_SIM: Omit<SimOptions, 'startTs'> = {
  seed: 20261016,
  roomId: 'demo-room',
  durationMs: 15 * 60 * 1000,
  audience: 40,
  eventsPerSec: 4,
  giftRatio: 0.04,
};

/** 档位分布：小额高频、大额稀少（与方案 5.6 付费分布方向一致）。 */
const TIER_WEIGHTS: Record<Tier, number> = { 0: 45, 1: 22, 2: 12, 3: 9, 4: 6, 5: 3.5, 6: 1.8, 7: 0.7 };

const NICK_HEADS = ['小', '阿', '老', '大', '甜', '酷', '静', '暖'];
const NICK_TAILS = ['鱼', '橙', '星', '叶', '云', '月', '风', '桃', '舟', '禾'];
const SLOGANS = ['冲！', '加油', '稳住', '好运来', '跃龙门', '锦鲤附体'];

export function simNick(i: number): string {
  const head = NICK_HEADS[i % NICK_HEADS.length] ?? '小';
  const tail = NICK_TAILS[Math.floor(i / NICK_HEADS.length) % NICK_TAILS.length] ?? '鱼';
  return `${head}${tail}${i}`;
}

export function generateSimEvents(opts: SimOptions): LiveEvent[] {
  const rand = mulberry32(opts.seed);
  const events: LiveEvent[] = [];
  const tierWeights = Object.values(TIER_WEIGHTS);
  let seq = 0;
  const id = () => `sim-${opts.seed}-${seq++}`;
  const user = (i: number) => ({ id: `u${i}`, nick: simNick(i) });

  // 开场：观众陆续弹幕选阵营
  for (let i = 0; i < opts.audience; i++) {
    const ts = opts.startTs + Math.floor(rand() * 60_000);
    const keyword = rand() < 0.55 ? '锦鲤' : '神龟';
    events.push({ type: 'comment', msgId: id(), ts, roomId: opts.roomId, user: user(i), text: keyword });
  }

  const total = Math.floor((opts.durationMs / 1000) * opts.eventsPerSec);
  for (let k = 0; k < total; k++) {
    const ts = opts.startTs + Math.floor(rand() * opts.durationMs);
    const u = user(Math.floor(rand() * opts.audience));
    const r = rand();
    if (r < opts.giftRatio) {
      const tier = pickWeighted(tierWeights, rand()) as Tier;
      const count = tier === 0 && rand() < 0.1 ? 66 : 1;
      events.push({ type: 'gift', msgId: id(), ts, roomId: opts.roomId, user: u, tier, count, randomSkinGift: tier === 4 });
    } else if (r < opts.giftRatio + 0.6) {
      events.push({ type: 'like', msgId: id(), ts, roomId: opts.roomId, user: u, count: 1 + Math.floor(rand() * 10) });
    } else {
      const text = SLOGANS[Math.floor(rand() * SLOGANS.length)] ?? '冲！';
      events.push({ type: 'comment', msgId: id(), ts, roomId: opts.roomId, user: u, text });
    }
  }
  return events.sort((a, b) => a.ts - b.ts || a.msgId.localeCompare(b.msgId));
}
