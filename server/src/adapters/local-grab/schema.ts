/**
 * 本地抓取工具（jwwsjlm/douyinLive 类）转发消息的宽松校验。
 * 按抖音 Webcast 消息语义解析；字段名以真机联调（任务 4.3）为准，未知字段一律放行。
 */
import { z } from 'zod';

const idLike = z.union([z.string(), z.number(), z.bigint()]).transform((v) => String(v));

export const grabUserSchema = z
  .object({
    id: idLike.optional(),
    idStr: idLike.optional(),
    shortId: idLike.optional(),
    secUid: z.string().optional(),
    nickName: z.string().optional(),
    nickname: z.string().optional(),
  })
  .passthrough();

export const grabCommonSchema = z
  .object({
    method: z.string().optional(),
    msgId: idLike.optional(),
    roomId: idLike.optional(),
  })
  .passthrough();

/** 消息体：方法名在顶层或 common 内；payload 可能为对象或 JSON 字符串。 */
export const grabEnvelopeSchema = z
  .object({
    method: z.string().optional(),
    common: grabCommonSchema.optional(),
    payload: z.unknown().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export const grabMessageBodySchema = z
  .object({
    common: grabCommonSchema.optional(),
    user: grabUserSchema.optional(),
    content: z.string().optional(),
    // 礼物
    giftId: idLike.optional(),
    gift: z
      .object({ id: idLike.optional(), name: z.string().optional(), diamondCount: z.coerce.number().optional() })
      .passthrough()
      .optional(),
    repeatCount: z.coerce.number().optional(),
    comboCount: z.coerce.number().optional(),
    groupId: idLike.optional(),
    repeatEnd: z.coerce.number().optional(),
    // 点赞
    count: z.coerce.number().optional(),
    total: z.coerce.number().optional(),
    // 关注
    action: z.coerce.number().optional(),
  })
  .passthrough();

export type GrabUser = z.infer<typeof grabUserSchema>;
export type GrabBody = z.infer<typeof grabMessageBodySchema>;
