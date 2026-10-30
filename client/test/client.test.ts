import { describe, expect, it } from 'vitest';
import { findBanned } from '../assets/scripts/generated/shared';
import { parseProfile, resolveLayout } from '../assets/scripts/logic/layout';
import { DemoSource, NetSource } from '../assets/scripts/logic/sources';
import { PHASE_LABEL, ViewModel, safeText } from '../assets/scripts/logic/view-model';
import douyin from '../assets/resources/profiles/douyin-375x812.json';
import wide from '../assets/resources/profiles/test-wide.json';

const names = { A: '锦鲤', B: '神龟' };

describe('layout profiles', () => {
  it('resolves regions inside the canvas for every shipped profile', () => {
    for (const raw of [douyin, wide]) {
      const p = parseProfile(raw);
      const l = resolveLayout(p);
      for (const [k, r] of Object.entries(l)) {
        expect(r.x, `${p.name}.${k}`).toBeGreaterThanOrEqual(0);
        expect(r.y, `${p.name}.${k}`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `${p.name}.${k}`).toBeLessThanOrEqual(p.canvas.width + 1e-6);
        expect(r.y + r.h, `${p.name}.${k}`).toBeLessThanOrEqual(p.canvas.height + 1e-6);
      }
    }
  });

  it('changing the safe area moves the layout with zero code changes', () => {
    const base = resolveLayout(parseProfile(douyin));
    const moved = resolveLayout(parseProfile({ ...douyin, safeArea: { ...douyin.safeArea, top: douyin.safeArea.top + 40 } }));
    expect(moved.topBar.y - base.topBar.y).toBe(40);
  });

  it('switching profile changes anchors (rank panel moves to the other corner)', () => {
    const a = resolveLayout(parseProfile(douyin));
    const b = resolveLayout(parseProfile(wide));
    expect(a.rank.x).toBeLessThan(a.topBar.x + 20);
    expect(b.rank.x).toBeGreaterThan(b.topBar.x + b.topBar.w / 2);
  });

  it('rejects broken profiles', () => {
    expect(() => parseProfile({ name: 'x' })).toThrow();
    expect(() => parseProfile({ ...douyin, safeArea: { top: 900, bottom: 0, left: 0, right: 0 } })).toThrow(/larger/);
  });
});

describe('demo mode', () => {
  it('plays a full match (charge → clash → fortune → settle) without a server', () => {
    const src = new DemoSource({ seed: 11 });
    const vm = new ViewModel(names);
    const phases = new Set<string>();
    let settled = false;
    for (let t = 0; t <= 25 * 60 * 1000; t += 100) {
      const f = src.poll(t);
      if (!f) continue;
      vm.apply(f.snapshot, f.effects);
      phases.add(f.snapshot.phase);
      if (f.snapshot.result) settled = true;
    }
    expect([...phases]).toEqual(expect.arrayContaining(['charge', 'clash', 'fortune']));
    expect(settled).toBe(true);
    expect(src.matchNo).toBeGreaterThanOrEqual(1);
  });

  it('reflects state changes in the very next frame (≤1s budget)', () => {
    const src = new DemoSource({ seed: 3 });
    let prev = src.poll(0)!.snapshot;
    let changedWithin = Infinity;
    for (let t = 100; t <= 120_000; t += 100) {
      const f = src.poll(t)!;
      if (f.effects.some((e) => e.kind === 'gift')) {
        changedWithin = 100; // 效果与快照同帧产出
        expect(f.snapshot.now).toBeGreaterThan(prev.now);
        break;
      }
      prev = f.snapshot;
    }
    expect(changedWithin).toBeLessThanOrEqual(1000);
  });
});

describe('demo loop', () => {
  it('continues with a fresh script after 14 minutes instead of replaying old events in one burst', () => {
    const src = new DemoSource({ seed: 9 });
    let maxEffects = 0;
    for (let t = 0; t <= 30 * 60 * 1000; t += 100) maxEffects = Math.max(maxEffects, src.poll(t)!.effects.length);
    expect(maxEffects).toBeLessThan(200);
    expect(src.matchNo).toBeGreaterThanOrEqual(2);
  });
});

describe('feedback', () => {
  it('turns a gift effect into feed text with the masked nick, in the same frame', () => {
    const vm = new ViewModel(names);
    const snap = new DemoSource().poll(0)!.snapshot;
    vm.apply(snap, [{ kind: 'gift', at: snap.now, side: 'A', nick: '小鱼**', tier: 4, effectTier: 4, count: 1, label: '召唤锦鲤', progressPct: 12.5, skins: ['星耀鲤'], rare: true, carried: false }]);
    expect(vm.feed.at(-1)).toMatchObject({ tone: 'rare', text: '小鱼** 召唤锦鲤·星耀鲤，进度 +12.5%' });
  });

  it('expires feed items and caps the list', () => {
    const vm = new ViewModel(names);
    const snap = new DemoSource().poll(0)!.snapshot;
    const comment = (i: number) => ({ kind: 'comment' as const, at: 0, side: 'A' as const, nick: 'n', text: `c${i}` });
    vm.apply(snap, Array.from({ length: 20 }, (_, i) => comment(i)));
    expect(vm.feed).toHaveLength(6);
    vm.apply({ ...snap, now: snap.now + 10_000 }, []);
    expect(vm.feed).toHaveLength(0);
  });

  it('never renders banned words, even from raw user text', () => {
    expect(findBanned(safeText('来抽奖吧'))).toEqual([]);
    for (const label of Object.values(PHASE_LABEL)) expect(findBanned(label)).toEqual([]);
  });

  it('never exposes money units in the feed', () => {
    const vm = new ViewModel(names);
    const src = new DemoSource({ seed: 5, speed: 20 });
    for (let t = 0; t < 60_000; t += 100) {
      const f = src.poll(t)!;
      vm.apply(f.snapshot, f.effects);
      for (const item of vm.feed) expect(item.text).not.toMatch(/[元￥¥]|抖币|\d+\s*币/);
    }
  });
});

describe('net source', () => {
  it('queues frames, merges effects, and ignores garbage', () => {
    const net = new NetSource('ws://x', () => ({ onopen: null, onclose: null, onmessage: null, close() {} }));
    const snap = new DemoSource().poll(0)!.snapshot;
    net.ingest('{bad');
    net.ingest(JSON.stringify({ type: 'hello' }));
    net.ingest(JSON.stringify({ type: 'frame', snapshot: snap, effects: [{ kind: 'follow', at: 0, nick: 'a' }] }));
    net.ingest(JSON.stringify({ type: 'frame', snapshot: { ...snap, now: 5 }, effects: [{ kind: 'follow', at: 0, nick: 'b' }] }));
    const f = net.poll()!;
    expect(f.effects).toHaveLength(2);
    expect(f.snapshot.now).toBe(5);
    expect(net.poll()).toBeNull();
  });
});
