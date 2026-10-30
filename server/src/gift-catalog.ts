/**
 * 礼物目录：平台礼物 → 价值（分）→ 档位。服务端配置驱动，可热更新；不硬编码任何平台礼物 ID。
 * 金额只在管道内存在：输出给 core 的 LiveEvent 只带档位。
 */
import type { Tier } from '@jinli/shared';

export interface GiftCatalog {
  platform: string;
  /** 平台虚拟币 → 分 的换算（抖音 1 抖币 = 0.1 元 = 10 分）。 */
  fenPerCoin: number;
  /** 档位上界（分，含）：T0..T6；超过 T6 上界即 T7。 */
  tierUpperFen: [number, number, number, number, number, number, number];
  /** 按礼物 ID 或名称覆盖价值/档位。 */
  gifts: Record<string, { fen?: number; tier?: Tier }>;
  /** 本平台唯一指定的随机外观款（礼物 ID 或名称）；未指定则无随机外观。 */
  randomSkinGift: string | null;
}

export const DOUYIN_CATALOG: GiftCatalog = {
  platform: 'douyin',
  fenPerCoin: 10,
  // 1 抖币→T0、19→T1、52→T2、99→T3、199→T4、520→T5、888→T6、1200→T7（方案 5.3）
  tierUpperFen: [50, 300, 700, 1500, 3000, 7000, 11000],
  gifts: {},
  randomSkinGift: null,
};

export function tierForFen(fen: number, catalog: GiftCatalog): Tier {
  const i = catalog.tierUpperFen.findIndex((upper) => fen <= upper);
  return (i < 0 ? 7 : i) as Tier;
}

export interface GiftValuation {
  fen: number | null;
  tier: Tier;
  randomSkinGift: boolean;
}

/** 价值归一化：目录覆盖优先 → 虚拟币换算兜底 → 未知按 T0。 */
export function valueGift(catalog: GiftCatalog, keys: { id?: string; name?: string; coins?: number }): GiftValuation {
  const entry = (keys.id !== undefined ? catalog.gifts[keys.id] : undefined) ?? (keys.name !== undefined ? catalog.gifts[keys.name] : undefined);
  const fen = entry?.fen ?? (keys.coins !== undefined && keys.coins > 0 ? keys.coins * catalog.fenPerCoin : null);
  const tier = entry?.tier ?? (fen !== null ? tierForFen(fen, catalog) : 0);
  const designated = catalog.randomSkinGift;
  const randomSkinGift = designated !== null && (keys.id === designated || keys.name === designated);
  return { fen, tier, randomSkinGift };
}
