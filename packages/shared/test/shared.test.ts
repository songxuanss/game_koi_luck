import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_SIM, findBanned, generateSimEvents, makeConfig, maskNick, maskText, simNick } from '../src';
import { parseGameConfig } from '../src/schema';

describe('wordlist filter', () => {
  it('finds Chinese terms as substrings and English terms on word boundaries', () => {
    expect(findBanned('一起来抽奖吧').map((h) => h.term)).toEqual(['抽奖']);
    expect(findBanned('Lucky Draw time').map((h) => h.term)).toEqual(['lucky draw']);
    expect(findBanned('luckyDrawer')).toHaveLength(1);
    expect(findBanned('ABCD 和 CDN')).toEqual([]);
    expect(findBanned('加 BUFF')).toHaveLength(1);
  });

  it('masks banned text character by character', () => {
    expect(maskText('盲盒来了')).toBe('**来了');
    expect(maskText('gacha!')).toBe('*****!');
  });

  it('masks nicknames without leaking the banned word', () => {
    expect(maskNick('锦鲤抽奖王')).toBe('锦鲤**');
    expect(maskNick('抽奖王')).toBe('水友**');
    expect(maskNick('  ')).toBe('水友');
    expect(maskNick('一二三四五六七八九十十一')).toBe('一二三四五六七八九十…');
    expect(maskNick('小鱼')).toBe('小鱼');
  });
});

describe('config', () => {
  it('default config passes runtime validation', () => {
    expect(() => parseGameConfig(DEFAULT_CONFIG)).not.toThrow();
  });

  it('rejects a single gift that could decide the match alone', () => {
    const bad = makeConfig();
    bad.tiers[7].progress = 13000;
    expect(() => parseGameConfig(bad)).toThrow(/12.5%/);
  });

  it('rejects inverted comeback thresholds', () => {
    const bad = makeConfig();
    bad.balance.comebackOff = 0.3;
    expect(() => parseGameConfig(bad)).toThrow();
  });

  it('labels and side names pass the wordlist', () => {
    const texts = [...DEFAULT_CONFIG.tiers.map((t) => t.label), DEFAULT_CONFIG.sides.A.name, DEFAULT_CONFIG.sides.B.name, ...DEFAULT_CONFIG.randomSkin.skins.map((s) => s.label)];
    for (const t of texts) expect(findBanned(t), t).toEqual([]);
  });

  it('published skin probabilities sum to 100', () => {
    expect(DEFAULT_CONFIG.randomSkin.skins.reduce((a, s) => a + s.weight, 0)).toBe(100);
  });
});

describe('sim script', () => {
  it('is deterministic and sorted', () => {
    const a = generateSimEvents({ ...DEFAULT_SIM, startTs: 0 });
    const b = generateSimEvents({ ...DEFAULT_SIM, startTs: 0 });
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i]!.ts).toBeGreaterThanOrEqual(a[i - 1]!.ts);
  });

  it('generates clean nicknames', () => {
    for (let i = 0; i < 200; i++) expect(findBanned(simNick(i))).toEqual([]);
  });
});
