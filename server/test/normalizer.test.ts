import { describe, expect, it } from 'vitest';
import { DOUYIN_CATALOG, LocalGrabNormalizer, tierForFen, valueGift } from '../src';
import { camelizeKeys } from '../src/adapters/local-grab/normalizer';

function make(overrides: Partial<typeof DOUYIN_CATALOG> = {}) {
  const unknown: string[] = [];
  const audit: { fen: number | null }[] = [];
  const n = new LocalGrabNormalizer({
    roomId: 'r1',
    catalog: { ...DOUYIN_CATALOG, ...overrides },
    now: () => 1000,
    onUnknown: (i) => unknown.push(i.reason),
    onGiftAudit: (i) => audit.push(i),
  });
  return { n, unknown, audit };
}

const user = { id: 123, nickName: '小鱼' };

describe('LocalGrabNormalizer', () => {
  it('normalizes a chat message into a comment event', () => {
    const { n } = make();
    const out = n.normalize(JSON.stringify({ method: 'WebcastChatMessage', payload: { common: { msgId: 'a1' }, user, content: '锦鲤' } }));
    expect(out).toEqual([{ type: 'comment', msgId: 'lg:a1', ts: 1000, roomId: 'r1', user: { id: '123', nick: '小鱼' }, text: '锦鲤' }]);
  });

  it('accepts method inside common and payload as a JSON string', () => {
    const { n } = make();
    const payload = JSON.stringify({ common: { msgId: 'a2', method: 'WebcastLikeMessage' }, user, count: 5 });
    const out = n.normalize({ common: { method: 'WebcastLikeMessage' }, payload });
    expect(out).toMatchObject([{ type: 'like', count: 5 }]);
  });

  it('deduplicates by idempotency key', () => {
    const { n } = make();
    const msg = { method: 'WebcastChatMessage', payload: { common: { msgId: 'dup' }, user, content: 'hi' } };
    expect(n.normalize(msg)).toHaveLength(1);
    expect(n.normalize(msg)).toHaveLength(0);
  });

  it('masks banned nicknames and comment text', () => {
    const { n } = make();
    const out = n.normalize({ method: 'WebcastChatMessage', payload: { common: { msgId: 'm' }, user: { id: 1, nickName: '锦鲤抽奖王' }, content: '一起抽奖' } });
    expect(out[0]).toMatchObject({ user: { nick: '锦鲤**' }, text: '一起**' });
  });

  it('survives unknown methods and garbage without throwing', () => {
    const { n, unknown } = make();
    expect(n.normalize('not json')).toEqual([]);
    expect(n.normalize({ method: 'WebcastRoomStatsMessage', payload: {} })).toEqual([]);
    expect(n.normalize({ method: 'WebcastChatMessage', payload: { common: { msgId: 'x' } } })).toEqual([]);
    expect(n.normalize(42)).toEqual([]);
    expect(unknown).toEqual(['invalid-json', 'unsupported-method', 'missing-user', 'invalid-envelope']);
  });

  it('values gifts by coin count, keeps money out of the event, and audits it', () => {
    const { n, audit } = make();
    const out = n.normalize({ method: 'WebcastGiftMessage', payload: { common: { msgId: 'g1' }, user, gift: { id: 9, name: '小心心', diamondCount: 199 } } });
    expect(out).toEqual([{ type: 'gift', msgId: 'lg:g1', ts: 1000, roomId: 'r1', user: { id: '123', nick: '小鱼' }, tier: 4, count: 1, randomSkinGift: false }]);
    expect(JSON.stringify(out)).not.toMatch(/fen|diamond|coin/i);
    expect(audit).toEqual([expect.objectContaining({ fen: 1990, tier: 4 })]);
  });

  it('splits cumulative combo updates into increments', () => {
    const { n } = make();
    const combo = (msgId: string, repeatCount: number, repeatEnd = 0) =>
      n.normalize({ method: 'WebcastGiftMessage', payload: { common: { msgId }, user, giftId: 5, gift: { diamondCount: 1 }, groupId: 77, repeatCount, repeatEnd } });
    expect(combo('c', 1)).toMatchObject([{ count: 1 }]);
    expect(combo('c', 5)).toMatchObject([{ count: 4 }]);
    expect(combo('c', 5)).toEqual([]);
    expect(combo('c2', 10, 1)).toMatchObject([{ count: 5 }]);
  });

  it('marks only the designated random-skin gift', () => {
    const { n } = make({ randomSkinGift: '锦鲤礼' });
    const g = (name: string, msgId: string) =>
      n.normalize({ method: 'WebcastGiftMessage', payload: { common: { msgId }, user, gift: { name, diamondCount: 199 } } })[0];
    expect(g('锦鲤礼', 'k1')).toMatchObject({ tier: 4, randomSkinGift: true });
    expect(g('别的礼物', 'k2')).toMatchObject({ tier: 4, randomSkinGift: false });
  });

  it('only emits follow for follow actions', () => {
    const { n } = make();
    expect(n.normalize({ method: 'WebcastSocialMessage', payload: { common: { msgId: 's1' }, user, action: 1 } })).toHaveLength(1);
    expect(n.normalize({ method: 'WebcastSocialMessage', payload: { common: { msgId: 's2' }, user, action: 3 } })).toHaveLength(0);
  });
});

describe('real tool wire format (jwwsjlm/douyinLive docs)', () => {
  it('parses the documented flat envelope: method/user.nickname/content at top level', () => {
    const { n } = make();
    const out = n.normalize(JSON.stringify({ method: 'WebcastChatMessage', livename: '主播', title: 't', avatarThumb: 'u', user: { id: 7, nickname: '路人甲' }, content: '冲' }));
    expect(out).toMatchObject([{ type: 'comment', user: { id: '7', nick: '路人甲' }, text: '冲' }]);
  });

  it('parses a flat gift with gift.name only (no price) as T0 and snake_case keys', () => {
    const { n } = make();
    const out = n.normalize({ method: 'WebcastGiftMessage', user: { id: 1, nickname: 'a' }, gift: { name: '玫瑰' }, repeat_count: 3 });
    expect(out).toMatchObject([{ type: 'gift', tier: 0, count: 3 }]);
    const priced = n.normalize({ method: 'WebcastGiftMessage', common: { msg_id: 'p1' }, user: { id: 1, nickname: 'a' }, gift: { name: '大礼', diamond_count: 520 } });
    expect(priced).toMatchObject([{ tier: 5 }]);
  });

  it('answers pong silently and reports system status frames', () => {
    const sys: string[] = [];
    const n = new LocalGrabNormalizer({ roomId: 'r', catalog: DOUYIN_CATALOG, now: () => 1, onSystem: (s) => sys.push(s.code), onUnknown: () => sys.push('UNKNOWN') });
    expect(n.normalize('pong')).toEqual([]);
    expect(n.normalize({ type: 'system', event: 'live_status', code: 'ROOM_OFFLINE' })).toEqual([]);
    expect(sys).toEqual(['ROOM_OFFLINE']);
  });

  it('camelizeKeys converts nested snake_case', () => {
    expect(camelizeKeys({ a_b: { c_d: [{ e_f: 1 }] } })).toEqual({ aB: { cD: [{ eF: 1 }] } });
  });
});

describe('gift catalog', () => {
  it('maps the Douyin price ladder onto tiers (方案 5.3)', () => {
    const ladder: [number, number][] = [[1, 0], [19, 1], [52, 2], [99, 3], [199, 4], [520, 5], [888, 6], [1200, 7]];
    for (const [coins, tier] of ladder) expect(tierForFen(coins * 10, DOUYIN_CATALOG)).toBe(tier);
  });

  it('prefers catalog overrides and falls back to T0 for unknown gifts', () => {
    const catalog = { ...DOUYIN_CATALOG, gifts: { magic: { tier: 0 as const, fen: 1 } } };
    expect(valueGift(catalog, { id: 'magic', coins: 500 })).toMatchObject({ tier: 0, fen: 1 });
    expect(valueGift(catalog, { name: '???' })).toMatchObject({ tier: 0, fen: null });
  });
});
