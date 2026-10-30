/**
 * local-grab normalizer：抓取消息 → LiveEvent。
 * 职责：方法识别、昵称打码、弹幕文本过滤、价值归一化（金额止于此处）、连击增量拆分、幂等去重。
 */
import { maskNick, maskText, type LiveEvent, type LiveUser } from '@jinli/shared';
import { Deduper } from '../../dedupe';
import { valueGift, type GiftCatalog } from '../../gift-catalog';
import { grabEnvelopeSchema, grabMessageBodySchema, type GrabBody } from './schema';

export interface NormalizerOptions {
  roomId: string;
  catalog: GiftCatalog;
  now: () => number;
  /** 未识别/非法消息回调（只记录方法名与原因，不记录用户信息）。 */
  onUnknown?: (info: { method: string | null; reason: string }) => void;
  /** 抓取工具的系统状态消息（如 ROOM_ONLINE / ROOM_OFFLINE）。 */
  onSystem?: (info: { event: string; code: string }) => void;
  /** 审计回调：金额只出现在这里（不进入 LiveEvent）。 */
  onGiftAudit?: (info: { msgId: string; fen: number | null; tier: number; count: number }) => void;
}

type Kind = 'comment' | 'gift' | 'like' | 'join' | 'follow';

const METHOD_KIND: Record<string, Kind> = {
  WebcastChatMessage: 'comment',
  WebcastGiftMessage: 'gift',
  WebcastLikeMessage: 'like',
  WebcastMemberMessage: 'join',
  WebcastSocialMessage: 'follow',
};

/** snake_case → camelCase（protobuf→JSON 转换器的键风格不固定，统一成 camelCase 再校验）。 */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = camelizeKeys(v);
    return out;
  }
  return value;
}

export class LocalGrabNormalizer {
  private readonly dedupe = new Deduper();
  /** 连击累计：key → 已结算的累计个数。 */
  private readonly combos = new Map<string, number>();
  private seq = 0;

  constructor(private opts: NormalizerOptions) {}

  setCatalog(catalog: GiftCatalog): void {
    this.opts = { ...this.opts, catalog };
  }

  /** 输入原始 WS 文本或已解析对象，输出 0~1 条 LiveEvent。永不抛异常。 */
  normalize(raw: unknown): LiveEvent[] {
    let data: unknown = raw;
    if (typeof raw === 'string') {
      if (raw === 'pong') return [];
      try {
        data = JSON.parse(raw);
      } catch {
        this.opts.onUnknown?.({ method: null, reason: 'invalid-json' });
        return [];
      }
    }
    data = camelizeKeys(data);
    const sys = data as { type?: unknown; event?: unknown; code?: unknown };
    if (sys && typeof sys === 'object' && sys.type === 'system') {
      this.opts.onSystem?.({ event: String(sys.event ?? ''), code: String(sys.code ?? '') });
      return [];
    }
    const env = grabEnvelopeSchema.safeParse(data);
    if (!env.success) {
      this.opts.onUnknown?.({ method: null, reason: 'invalid-envelope' });
      return [];
    }
    const method = env.data.method ?? env.data.common?.method ?? null;
    const kind = method !== null ? METHOD_KIND[method] : undefined;
    if (!kind) {
      this.opts.onUnknown?.({ method, reason: 'unsupported-method' });
      return [];
    }
    let bodyRaw: unknown = env.data.payload ?? env.data.data ?? data;
    if (typeof bodyRaw === 'string') {
      try {
        bodyRaw = JSON.parse(bodyRaw);
      } catch {
        this.opts.onUnknown?.({ method, reason: 'invalid-payload' });
        return [];
      }
    }
    const body = grabMessageBodySchema.safeParse(bodyRaw);
    if (!body.success) {
      this.opts.onUnknown?.({ method, reason: 'invalid-body' });
      return [];
    }
    return this.toEvents(kind, body.data, method ?? '');
  }

  private toEvents(kind: Kind, b: GrabBody, method: string): LiveEvent[] {
    const user = this.user(b);
    if (!user) {
      this.opts.onUnknown?.({ method, reason: 'missing-user' });
      return [];
    }
    const sourceId = b.common?.msgId ?? `nomsg-${this.seq++}`;
    // 连击礼物可能以同一 msgId 推送递增的累计数：幂等键带上累计数，增量由 comboDelta 计算
    const msgId = kind === 'gift' && b.repeatCount !== undefined ? `lg:${sourceId}:${b.repeatCount}` : `lg:${sourceId}`;
    if (!this.dedupe.admit(msgId)) return [];
    const base = { msgId, ts: this.opts.now(), roomId: this.opts.roomId, user };
    switch (kind) {
      case 'comment':
        return [{ ...base, type: 'comment', text: maskText((b.content ?? '').slice(0, 50)) }];
      case 'like':
        return [{ ...base, type: 'like', count: Math.max(1, Math.floor(b.count ?? 1)) }];
      case 'join':
        return [{ ...base, type: 'join' }];
      case 'follow':
        return b.action === undefined || b.action === 1 ? [{ ...base, type: 'follow' }] : [];
      case 'gift':
        return this.gift(b, base);
    }
  }

  private gift(b: GrabBody, base: { msgId: string; ts: number; roomId: string; user: LiveUser }): LiveEvent[] {
    const giftId = b.giftId ?? b.gift?.id;
    const count = this.comboDelta(b, base.user.id, giftId);
    if (count <= 0) return [];
    const v = valueGift(this.opts.catalog, { id: giftId, name: b.gift?.name, coins: b.gift?.diamondCount });
    this.opts.onGiftAudit?.({ msgId: base.msgId, fen: v.fen, tier: v.tier, count });
    return [{ ...base, type: 'gift', tier: v.tier, count, randomSkinGift: v.randomSkinGift }];
  }

  /** 抖音连击会重复推送累计 repeatCount：只结算增量。 */
  private comboDelta(b: GrabBody, userId: string, giftId: string | undefined): number {
    const total = Math.max(1, Math.floor(b.repeatCount ?? b.comboCount ?? 1));
    if (b.groupId === undefined) return total;
    const key = `${userId}:${giftId ?? '?'}:${b.groupId}`;
    const seen = this.combos.get(key) ?? 0;
    if (b.repeatEnd === 1) this.combos.delete(key);
    else this.combos.set(key, Math.max(seen, total));
    if (this.combos.size > 10_000) {
      const oldest = this.combos.keys().next().value;
      if (oldest !== undefined) this.combos.delete(oldest);
    }
    return total - seen;
  }

  private user(b: GrabBody): LiveUser | null {
    const u = b.user;
    if (!u) return null;
    const id = u.id ?? u.idStr ?? u.shortId ?? u.secUid;
    if (id === undefined) return null;
    return { id, nick: maskNick(u.nickName ?? u.nickname ?? '') };
  }
}
