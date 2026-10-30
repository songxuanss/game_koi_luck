/**
 * 对局配置运行时校验（zod）——仅 server/tools 使用，不同步进客户端。
 * 底部编译期断言保证 schema 与手写 GameConfig 类型完全一致。
 */
import { z } from 'zod';
import type { GameConfig } from './config';

const tier = z.union([0, 1, 2, 3, 4, 5, 6, 7].map((n) => z.literal(n)) as unknown as [
  z.ZodLiteral<0>, z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>,
  z.ZodLiteral<4>, z.ZodLiteral<5>, z.ZodLiteral<6>, z.ZodLiteral<7>,
]);
const ms = z.number().int().nonnegative();
const ratio = z.number().min(0).max(1);
const pos = z.number().positive();

const effect = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fry') }),
  z.object({ kind: z.literal('accel'), boost: ratio, durationMs: ms }),
  z.object({ kind: z.literal('shield'), durationMs: ms }),
  z.object({ kind: z.literal('elite'), suppressFry: ratio, durationMs: ms }),
  z.object({ kind: z.literal('strengthen'), boost: ratio, durationMs: ms }),
  z.object({ kind: z.literal('dragon'), suppress: ratio, durationMs: ms }),
  z.object({ kind: z.literal('leap') }),
]);

const tierRule = z.object({
  power: pos,
  progress: pos,
  delivery: z.enum(['instant', 'flow']),
  flowMs: ms,
  effect,
  label: z.string().min(1).max(5),
});

const side = z.object({ name: z.string().min(1), joinKeywords: z.array(z.string().min(1)).min(1) });

export const gameConfigSchema = z
  .object({
    version: z.string(),
    sides: z.object({ A: side, B: side }),
    phases: z.object({
      chargeMs: ms,
      chargeMsSparse: ms,
      sparseThreshold: z.number().int().nonnegative(),
      clashMs: ms,
      fortuneMs: ms,
      settleMs: ms,
    }),
    winProgress: pos,
    progressCeil: z.object({ charge: ratio, clash: ratio }),
    fortuneMultiplier: z.number().min(1),
    overtimeRatePerSec: pos,
    tiers: z.tuple([tierRule, tierRule, tierRule, tierRule, tierRule, tierRule, tierRule, tierRule]),
    randomSkin: z.object({
      fallbackTier: tier,
      skins: z.array(z.object({ id: z.string(), label: z.string(), weight: z.number().nonnegative(), rare: z.boolean() })).min(1),
    }),
    dragon: z.object({ perMatch: z.number().int().nonnegative(), perUser: z.number().int().nonnegative(), fallbackTier: tier }),
    whale: z.object({ fromTier: tier, fromNth: z.number().int().min(1), personalShare: ratio, teamFlowMs: ms }),
    free: z.object({
      likeProgress: z.number().nonnegative(),
      likeCharge: z.number().nonnegative(),
      likePerUserPerSecCap: z.number().int().positive(),
      commentProgress: z.number().nonnegative(),
      commentCharge: z.number().nonnegative(),
      commentCooldownMs: ms,
    }),
    charge: z.object({ cap: pos, burstProgress: pos, giftChargePerPower: z.number().nonnegative(), giftShareCap: ratio }),
    balance: z.object({
      exponent: z.number().nonnegative(),
      maxWeight: z.number().min(1),
      comebackOn: ratio,
      comebackOff: ratio,
      comebackBoost: z.number().min(1),
      lossStreakStep: ratio,
      lossStreakCap: ratio,
    }),
    counterFactor: ratio,
    settle: z.object({ topN: z.number().int().positive(), starsBase: z.number().int().nonnegative(), starsWinBonus: z.number().int().nonnegative() }),
    hotReload: z.enum(['next-match', 'immediate']),
  })
  .superRefine((c, ctx) => {
    // 方案 5.9 ⑧：任何单件礼物的进度不得超过胜负线 12.5%
    c.tiers.forEach((t, i) => {
      if (t.progress > c.winProgress * 0.125) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tiers', i, 'progress'], message: '单件礼物进度超过胜负线 12.5%（大额不得独立决胜）' });
      }
    });
    if (c.balance.comebackOff >= c.balance.comebackOn) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['balance'], message: '逆流解除阈值必须小于触发阈值' });
    }
    if (c.tiers[4].effect.kind !== 'elite') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tiers', 4], message: 'T4 必须为随机外观款（精英锦鲤）' });
    }
  });

type SchemaType = z.infer<typeof gameConfigSchema>;
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const schemaMatchesType: Equals<SchemaType, GameConfig> = true;
void schemaMatchesType;

export function parseGameConfig(input: unknown): GameConfig {
  return gameConfigSchema.parse(input) as GameConfig;
}
