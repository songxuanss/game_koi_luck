import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM, generateSimEvents, makeConfig } from '@jinli/shared';
import { RoomManager, type Frame, type Scheduler } from '../src';

function fakeEnv() {
  let now = 0;
  const jobs: { fn: () => void; ms: number; next: number; id: number }[] = [];
  let ids = 0;
  const scheduler: Scheduler = {
    setInterval: (fn, ms) => {
      const id = ids++;
      jobs.push({ fn, ms, next: now + ms, id });
      return id;
    },
    clearInterval: (h) => {
      const i = jobs.findIndex((j) => j.id === h);
      if (i >= 0) jobs.splice(i, 1);
    },
  };
  const advanceTo = (t: number) => {
    for (;;) {
      const job = jobs.filter((j) => j.next <= t).sort((a, b) => a.next - b.next)[0];
      if (!job) break;
      now = job.next;
      job.next += job.ms;
      job.fn();
    }
    now = t;
  };
  return { scheduler, now: () => now, advanceTo };
}

describe('RoomManager', () => {
  it('feeds 5000 random events and broadcasts a consistent frame sequence', () => {
    const env = fakeEnv();
    const rm = new RoomManager({ config: makeConfig(), now: env.now, scheduler: env.scheduler });
    rm.start();
    const frames: Frame[] = [];
    const unsub = rm.subscribe('demo-room', (f) => frames.push(f));
    const events = generateSimEvents({ ...DEFAULT_SIM, startTs: 0, durationMs: 25 * 60 * 1000, eventsPerSec: 3.5 }).slice(0, 5000);
    expect(events).toHaveLength(5000);
    for (const ev of events) {
      env.advanceTo(ev.ts);
      rm.ingest(ev);
    }
    env.advanceTo(events.at(-1)!.ts + 1000);
    expect(rm.stats.events).toBe(5000);
    expect(frames.length).toBeGreaterThan(100);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.seq).toBe(frames[i - 1]!.seq + 1);
      expect(frames[i]!.snapshot.matchNo).toBeGreaterThanOrEqual(frames[i - 1]!.snapshot.matchNo);
    }
    const effectCount = frames.reduce((n, f) => n + f.effects.length, 0);
    expect(effectCount).toBeGreaterThan(5000);
    unsub();
    rm.stop();
  });

  it('applies hot-reloaded config on the next match by default', () => {
    const env = fakeEnv();
    const rm = new RoomManager({ config: makeConfig(), now: env.now, scheduler: env.scheduler });
    rm.start();
    rm.subscribe('r', () => {});
    expect(rm.setConfig(makeConfig({ version: 'v2' }))).toBe('next-match');
    expect(rm.getRoomConfigVersion('r')).toBe('5.9-v1+v0.7');
    env.advanceTo(30 * 60 * 1000); // 空房间：蓄势→攻防→鸿运→终局潮汐→结算→下一局
    expect(rm.getSnapshot('r')!.matchNo).toBeGreaterThan(1);
    expect(rm.getRoomConfigVersion('r')).toBe('v2');
  });

  it('applies immediately when the config says so, and rejects invalid configs', () => {
    const env = fakeEnv();
    const rm = new RoomManager({ config: makeConfig(), now: env.now, scheduler: env.scheduler });
    rm.subscribe('r', () => {});
    expect(rm.setConfig(makeConfig({ version: 'hot', hotReload: 'immediate' }))).toBe('immediate');
    expect(rm.getRoomConfigVersion('r')).toBe('hot');
    const bad = makeConfig();
    bad.tiers[7].progress = 99999;
    expect(() => rm.setConfig(bad)).toThrow();
  });

  it('recycles idle rooms with no subscribers', () => {
    const env = fakeEnv();
    const rm = new RoomManager({ config: makeConfig(), now: env.now, scheduler: env.scheduler, idleRoomMs: 5000 });
    rm.start();
    const unsub = rm.subscribe('r', () => {});
    env.advanceTo(10_000);
    expect(rm.roomIds()).toEqual(['r']);
    unsub();
    env.advanceTo(20_000);
    expect(rm.roomIds()).toEqual([]);
    rm.stop();
  });
});
