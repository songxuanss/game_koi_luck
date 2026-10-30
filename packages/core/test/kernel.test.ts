import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM, generateSimEvents, makeConfig, type GiftEvent, type LiveEvent, type SideId, type Tier } from '@jinli/shared';
import { balanceWeight, createRoomState, snapshot, step, type Effect, type RoomState } from '../src';

const cfg = makeConfig();
let seq = 0;
const id = () => `m${seq++}`;

function run(state: RoomState, inputs: Parameters<typeof step>[1][]): Effect[] {
  const out: Effect[] = [];
  for (const i of inputs) out.push(...step(state, i, cfg).effects);
  return out;
}

function tickTo(state: RoomState, ts: number, every = 200): Effect[] {
  const out: Effect[] = [];
  for (let t = state.now + every; t <= ts; t += every) out.push(...step(state, { type: 'tick', ts: t }, cfg).effects);
  return out;
}

function join(state: RoomState, userId: string, side: SideId, ts = state.now): Effect[] {
  return run(state, [{ type: 'comment', msgId: id(), ts, roomId: 'r', user: { id: userId, nick: userId }, text: cfg.sides[side].name }]);
}

function gift(state: RoomState, userId: string, tier: Tier, opts: Partial<GiftEvent> = {}): Effect[] {
  return run(state, [
    { type: 'gift', msgId: id(), ts: state.now, roomId: 'r', user: { id: userId, nick: userId }, tier, count: 1, randomSkinGift: tier === 4, ...opts },
  ]);
}

/** 进入攻防阶段的房间：A 方 1 人，B 方 0 人（乘数为 1）。 */
function clashRoom(): RoomState {
  const s = createRoomState('r', 0);
  join(s, 'a1', 'A');
  tickTo(s, cfg.phases.chargeMsSparse + 200);
  expect(s.phase).toBe('clash');
  s.sides.A.progress = 0;
  s.sides.A.power = 0;
  s.users.a1!.power = 0;
  return s;
}

describe('phases', () => {
  it('runs an empty room through all phases, ends via overtime as a draw, then starts match 2', () => {
    const s = createRoomState('r', 0);
    const phases: string[] = [];
    for (const e of tickTo(s, 2_000_000, 1000)) if (e.kind === 'phase') phases.push(`${e.matchNo}:${e.phase}`);
    expect(phases.slice(0, 6)).toEqual(['1:clash', '1:fortune', '1:overtime', '1:settle', '2:charge', '2:clash']);
    const settle = run(createRoomState('x', 0), []);
    expect(settle).toEqual([]);
  });

  it('shortens the charge phase when the room is sparse', () => {
    const sparse = createRoomState('r', 0);
    tickTo(sparse, cfg.phases.chargeMsSparse);
    expect(sparse.phase).toBe('clash');

    const busy = createRoomState('r', 0);
    for (let i = 0; i < cfg.phases.sparseThreshold; i++) join(busy, `u${i}`, i % 2 ? 'A' : 'B', 0);
    tickTo(busy, cfg.phases.chargeMsSparse + 1000);
    expect(busy.phase).toBe('charge');
    tickTo(busy, cfg.phases.chargeMs);
    expect(busy.phase).toBe('clash');
  });

  it('overtime draw is resolved by equal auto-progress and records reason', () => {
    const s = createRoomState('r', 0);
    const effects = tickTo(s, 1_000_000, 1000);
    const settle = effects.find((e) => e.kind === 'settle');
    expect(settle && settle.kind === 'settle' && settle.result).toMatchObject({ winner: 'draw', reason: 'overtime' });
  });
});

describe('tier economy', () => {
  const expected: Record<Tier, { power: number; progress: number }> = {
    0: { power: 25, progress: 25 },
    1: { power: 100, progress: 100 },
    2: { power: 260, progress: 260 },
    3: { power: 520, progress: 520 },
    4: { power: 1050, progress: 1000 },
    5: { power: 2600, progress: 1000 },
    6: { power: 5200, progress: 800 },
    7: { power: 13000, progress: 960 },
  };

  for (const tier of [0, 1, 2, 3, 4, 5, 6, 7] as Tier[]) {
    it(`T${tier} credits power and progress`, () => {
      const s = clashRoom();
      gift(s, 'a1', tier);
      // T2 自带加速、T5 自带强化，会放大后续流；鱼苗流在 60s 内兑现完毕
      tickTo(s, s.now + 61_000);
      expect(s.users.a1!.power).toBe(expected[tier].power);
      expect(s.sides.A.progress).toBeGreaterThanOrEqual(expected[tier].progress - 1e-6);
      expect(s.sides.A.progress).toBeLessThanOrEqual(expected[tier].progress + 1e-6);
    });
  }

  it('no single gift exceeds 12.5% of the win line', () => {
    for (const t of cfg.tiers) expect(t.progress).toBeLessThanOrEqual(cfg.winProgress * 0.125);
  });

  it('handles a 66x combo of T0', () => {
    const s = clashRoom();
    const fx = gift(s, 'a1', 0, { count: 66 });
    expect(fx.find((e) => e.kind === 'gift')).toMatchObject({ count: 66, tier: 0 });
    tickTo(s, s.now + 61_000);
    expect(s.users.a1!.power).toBe(66 * 25);
    expect(s.sides.A.progress).toBeCloseTo(66 * 25, 6);
  });

  it('T4 that is not the designated random-skin gift falls back to T3 effect', () => {
    const s = clashRoom();
    const fx = gift(s, 'a1', 4, { randomSkinGift: false });
    const g = fx.find((e) => e.kind === 'gift');
    expect(g).toMatchObject({ tier: 4, effectTier: 3, skins: [] });
    expect(s.users.a1!.power).toBe(1050);
    expect(s.sides.A.progress).toBeCloseTo(520, 6);
    expect(s.sides.A.eliteUntil).toBe(0);
  });

  it('designated T4 rolls a deterministic skin from the message id', () => {
    const roll = () => {
      const s = clashRoom();
      const fx = gift(s, 'a1', 4, { msgId: 'fixed-msg', randomSkinGift: true });
      const g = fx.find((e) => e.kind === 'gift');
      return g && g.kind === 'gift' ? g.skins : [];
    };
    const first = roll();
    expect(first).toHaveLength(1);
    expect(roll()).toEqual(first);
  });

  it('caps dragons per user and per match, falling back to T5 with a visible effect', () => {
    const s = clashRoom();
    gift(s, 'a1', 6);
    const second = gift(s, 'a1', 6);
    expect(second.some((e) => e.kind === 'dragon-full')).toBe(true);
    expect(second.find((e) => e.kind === 'gift')).toMatchObject({ effectTier: 5 });
    gift(s, 'a2', 6);
    gift(s, 'a3', 6);
    const fourth = gift(s, 'a4', 6);
    expect(s.dragonsThisMatch).toBe(3);
    expect(fourth.some((e) => e.kind === 'dragon-full')).toBe(true);
  });

  it('applies whale diminishing from the 2nd big gift (personal 70%, rest as team flow)', () => {
    const s = clashRoom();
    s.users.a1!.bigGifts = 1;
    gift(s, 'a1', 7);
    expect(s.sides.A.progress).toBeCloseTo(960 * 0.7, 6);
    expect(s.flows.some((f) => f.kind === 'team' && Math.abs(f.remaining - 960 * 0.3) < 1e-6)).toBe(true);
    expect(s.users.a1!.power).toBe(13000);
  });
});

describe('balance', () => {
  it('weights the smaller side with the published formula, clamped to 1.35', () => {
    const s = createRoomState('r', 0);
    for (let i = 0; i < 7; i++) join(s, `a${i}`, 'A');
    for (let i = 0; i < 3; i++) join(s, `b${i}`, 'B');
    expect(balanceWeight(s, 'B', cfg)).toBe(1.35);
    expect(balanceWeight(s, 'A', cfg)).toBe(1);
    s.sides.A.members = 6;
    s.sides.B.members = 4;
    expect(balanceWeight(s, 'B', cfg)).toBeCloseTo(Math.pow(1.5, 0.4), 10);
  });

  it('auto-assigns unjoined users to the smaller side', () => {
    const s = createRoomState('r', 0);
    join(s, 'a1', 'A');
    run(s, [{ type: 'like', msgId: id(), ts: 0, roomId: 'r', user: { id: 'x', nick: 'x' }, count: 1 }]);
    expect(s.users.x!.side).toBe('B');
  });

  it('turns comeback on at a 20% gap and off below 10%', () => {
    const s = clashRoom();
    join(s, 'b1', 'B');
    s.sides.A.progress = 1700;
    const on = tickTo(s, s.now + 200);
    expect(s.comebackSide).toBe('B');
    expect(on.some((e) => e.kind === 'comeback' && e.side === 'B')).toBe(true);
    s.sides.B.progress = 1000; // 差 700/8000 = 8.75%
    const off = [...gift(s, 'b1', 0), ...tickTo(s, s.now + 200)];
    expect(s.comebackSide).toBeNull();
    expect(off.some((e) => e.kind === 'comeback' && e.side === null)).toBe(true);
  });

  it('caps loss-streak bonus at 10%', () => {
    const s = createRoomState('r', 0);
    s.sides.B.lossStreak = 1;
    s.sides.A.lossStreak = 5;
    join(s, 'a1', 'A');
    join(s, 'b1', 'B');
    tickTo(s, cfg.phases.chargeMsSparse + 200);
    const before = s.sides.A.progress;
    gift(s, 'a1', 3);
    expect(s.sides.A.progress - before).toBeCloseTo(520 * 1.1, 6);
    const b0 = s.sides.B.progress;
    gift(s, 'b1', 3);
    expect(s.sides.B.progress - b0).toBeCloseTo(520 * 1.05, 6);
  });
});

describe('counter ring', () => {
  function duel(): RoomState {
    const s = clashRoom();
    join(s, 'b1', 'B');
    return s;
  }

  it('accel counters burst: suppression on the accelerating side is halved', () => {
    const s = duel();
    gift(s, 'a1', 2);
    const fx = gift(s, 'b1', 6);
    expect(fx.some((e) => e.kind === 'counter' && e.counter === 'accel-vs-burst' && e.side === 'A')).toBe(true);
  });

  it('shield counters accel: opposing accel boost is halved', () => {
    const s = duel();
    gift(s, 'b1', 3);
    const fx = gift(s, 'a1', 2);
    expect(fx.some((e) => e.kind === 'counter' && e.counter === 'shield-vs-accel' && e.side === 'B')).toBe(true);
    expect(s.sides.A.accelBoost).toBeCloseTo(0.075, 10);
  });

  it('burst counters shield: shield breaks and absorbs half', () => {
    const s = duel();
    gift(s, 'a1', 3);
    const fx = gift(s, 'b1', 6);
    expect(fx.some((e) => e.kind === 'counter' && e.counter === 'burst-vs-shield' && e.side === 'B')).toBe(true);
    expect(s.sides.A.shieldUntil).toBeLessThanOrEqual(s.now);
    expect(s.sides.B.dragonSuppress).toBeCloseTo(0.125, 10);
  });
});

describe('phase pacing (方案 5.9 ①)', () => {
  it('caps progress per phase: 5% in charge, 85% in clash, up to 100% from fortune', () => {
    const s = createRoomState('r', 0);
    join(s, 'a1', 'A');
    for (let i = 0; i < 20; i++) gift(s, 'a1', 3);
    expect(s.sides.A.progress).toBeLessThanOrEqual(cfg.winProgress * 0.05 + 1e-6);
    tickTo(s, cfg.phases.chargeMsSparse + 200);
    expect(s.phase).toBe('clash');
    for (let i = 0; i < 100; i++) gift(s, 'a1', 5);
    expect(s.phase).toBe('clash');
    expect(s.sides.A.progress).toBeLessThanOrEqual(cfg.winProgress * 0.85 + 1e-6);
    expect(s.sides.A.progress).toBeGreaterThan(cfg.winProgress * 0.8);
    tickTo(s, s.now + cfg.phases.clashMs);
    expect(s.phase).toBe('fortune');
    for (let i = 0; i < 5; i++) gift(s, 'a1', 5);
    expect(s.phase).toBe('settle');
  });
});

describe('free interaction', () => {
  it('likes fill the collective charge and release a surge', () => {
    const s = clashRoom();
    const fx: Effect[] = [];
    for (let i = 0; i < 100; i++) {
      fx.push(...run(s, [{ type: 'like', msgId: id(), ts: s.now + 1000, roomId: 'r', user: { id: `l${i}`, nick: 'n' }, count: 10 }]));
    }
    expect(fx.some((e) => e.kind === 'surge')).toBe(true);
  });

  it('gifts alone cannot fill the charge (accelerate, not replace)', () => {
    const s = clashRoom();
    const fx: Effect[] = [];
    for (let i = 0; i < 30; i++) fx.push(...gift(s, 'a1', 3));
    expect(fx.some((e) => e.kind === 'surge')).toBe(false);
    expect(s.sides.A.giftChargeThisCycle).toBeLessThanOrEqual(cfg.charge.cap * cfg.charge.giftShareCap);
  });

  it('caps likes per user per second', () => {
    const s = clashRoom();
    run(s, [{ type: 'like', msgId: id(), ts: s.now, roomId: 'r', user: { id: 'a1', nick: 'a1' }, count: 1000 }]);
    // +1 来自 clashRoom 中的入场弹幕
    expect(s.users.a1!.cheers).toBe(cfg.free.likePerUserPerSecCap + 1);
  });
});

describe('win and settlement', () => {
  it('ends the match the moment a side reaches 100% and names the key player', () => {
    const s = clashRoom();
    s.phase = 'fortune';
    s.phaseStartedAt = s.now;
    s.sides.A.progress = cfg.winProgress - 100;
    const fx = gift(s, 'a1', 3);
    const settle = fx.find((e) => e.kind === 'settle');
    expect(s.phase).toBe('settle');
    expect(settle && settle.kind === 'settle' && settle.result).toMatchObject({ winner: 'A', reason: 'reach', keyPlayer: { nick: 'a1', side: 'A' } });
    expect(s.sides.B.lossStreak).toBe(1);
  });

  it('carries gifts sent during settlement into the next match', () => {
    const s = clashRoom();
    s.sides.A.progress = cfg.winProgress;
    gift(s, 'a1', 0);
    expect(s.phase).toBe('settle');
    const fx = gift(s, 'a1', 3);
    expect(fx.find((e) => e.kind === 'gift')).toMatchObject({ carried: true });
    tickTo(s, s.now + cfg.phases.settleMs + 200);
    expect(s.matchNo).toBe(2);
    // 蓄势阶段进度上限 5%：结转的加持在新局开局时被钳制
    expect(s.sides.A.progress).toBeCloseTo(cfg.winProgress * cfg.progressCeil.charge, 6);
  });

  it('property: across random sessions every settlement satisfies the single win condition', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createRoomState('demo-room', 0);
      const events = generateSimEvents({ ...DEFAULT_SIM, seed, startTs: 0, durationMs: 40 * 60 * 1000, eventsPerSec: 6, giftRatio: 0.1 });
      let lastTick = 0;
      for (const ev of events) {
        while (lastTick + 200 < ev.ts) {
          lastTick += 200;
          checkSettles(step(s, { type: 'tick', ts: lastTick }, cfg).effects, s);
        }
        checkSettles(step(s, ev, cfg).effects, s);
      }
      expect(s.matchNo).toBeGreaterThan(1);
    }
  });
});

function checkSettles(effects: Effect[], s: RoomState): void {
  for (const e of effects) {
    if (e.kind !== 'settle') continue;
    const snap = snapshot(s, cfg);
    if (e.result.winner === 'draw') {
      expect(snap.sides.A.progress).toBe(1);
      expect(snap.sides.B.progress).toBe(1);
    } else {
      expect(snap.sides[e.result.winner].progress).toBe(1);
    }
  }
}

describe('determinism and money isolation', () => {
  function session(seed: number): { effects: Effect[]; snaps: unknown[] } {
    const s = createRoomState('demo-room', 0);
    const effects: Effect[] = [];
    const snaps: unknown[] = [];
    const events: LiveEvent[] = generateSimEvents({ ...DEFAULT_SIM, seed, startTs: 0, durationMs: 20 * 60 * 1000 });
    for (const ev of events) {
      effects.push(...step(s, ev, cfg).effects);
      if (effects.length % 50 === 0) snaps.push(snapshot(s, cfg));
    }
    snaps.push(snapshot(s, cfg));
    return { effects, snaps };
  }

  it('replays identically', () => {
    expect(JSON.stringify(session(7))).toBe(JSON.stringify(session(7)));
  });

  it('never outputs currency fields', () => {
    const out = JSON.stringify(session(9));
    const keys = [...out.matchAll(/"([A-Za-z_]+)":/g)].map((m) => m[1]!);
    const money = keys.filter((k) => /fen|yuan|price|amount|money|value|diamond|coin|cost|rmb/i.test(k));
    expect(money).toEqual([]);
  });
});
