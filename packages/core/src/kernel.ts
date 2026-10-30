/**
 * 对局内核：step(state, input, config) -> { state, effects }。
 *
 * - 确定性：无 IO、不读实时钟、不用 Math.random()；时间只来自输入时间戳。
 * - 线性所有权：传入的 state 被就地推进并返回（高频事件下避免整份拷贝）；
 *   调用方不得在 step 之后继续使用旧引用做比较。回放 = 从初始状态重放同一输入序列。
 * - 唯一胜负条件：任一方进度先达 winProgress。计时耗尽进入终局潮汐，不引入第二条件。
 */
import {
  SIDES,
  hashString,
  mulberry32,
  otherSide,
  pickWeighted,
  type CommentEvent,
  type GameConfig,
  type GiftEvent,
  type LikeEvent,
  type LiveUser,
  type SideId,
  type Tier,
  type TierEffect,
} from '@jinli/shared';
import type { CoreInput, CounterKind, Effect, RoomState, SideState, UserState } from './types';
import { buildSettleResult } from './snapshot';

/** 单个积分步长上限（持续效果与阶段边界的时间分辨率）。 */
const MAX_CHUNK_MS = 250;
/** 单条礼物消息逐件结算的上限（超出部分只计助力值，防异常数据卡死内核）。 */
const MAX_ITEMS_PER_GIFT = 200;

type GainSource = 'fry' | 'paid' | 'free' | 'overtime';

function newSide(lossStreak = 0): SideState {
  return {
    progress: 0,
    members: 0,
    power: 0,
    charge: 0,
    giftChargeThisCycle: 0,
    accelUntil: 0,
    accelBoost: 0,
    strengthenUntil: 0,
    strengthenBoost: 0,
    shieldUntil: 0,
    eliteUntil: 0,
    eliteSuppress: 0,
    dragonUntil: 0,
    dragonSuppress: 0,
    lossStreak,
    carry: 0,
    lastContributor: null,
  };
}

/** 开局：创建房间并进入第一局蓄势阶段。 */
export function createRoomState(roomId: string, ts: number): RoomState {
  return {
    roomId,
    matchNo: 1,
    phase: 'charge',
    phaseStartedAt: ts,
    matchStartedAt: ts,
    now: ts,
    sides: { A: newSide(), B: newSide() },
    users: {},
    userSeq: 0,
    flows: [],
    comebackSide: null,
    comebackAnnounced: null,
    dragonsThisMatch: 0,
    result: null,
  };
}

export interface StepResult {
  state: RoomState;
  effects: Effect[];
}

export function step(state: RoomState, input: CoreInput, config: GameConfig): StepResult {
  const effects: Effect[] = [];
  advance(state, Math.max(input.ts, state.now), config, effects);
  switch (input.type) {
    case 'tick':
      break;
    case 'comment':
      onComment(state, input, config, effects);
      break;
    case 'like':
      onLike(state, input, config, effects);
      break;
    case 'gift':
      onGift(state, input, config, effects);
      break;
    case 'join':
      effects.push({ kind: 'enter', at: state.now, nick: input.user.nick });
      break;
    case 'follow':
      effects.push({ kind: 'follow', at: state.now, nick: input.user.nick });
      break;
  }
  if (input.type !== 'tick') checkWin(state, config, effects);
  return { state, effects };
}

/** 当前阶段结束时间；终局潮汐无固定结束（null）。 */
export function phaseEndsAt(state: RoomState, config: GameConfig): number | null {
  const p = config.phases;
  switch (state.phase) {
    case 'charge': {
      const members = state.sides.A.members + state.sides.B.members;
      const dur = members < p.sparseThreshold ? p.chargeMsSparse : p.chargeMs;
      return state.phaseStartedAt + dur;
    }
    case 'clash':
      return state.phaseStartedAt + p.clashMs;
    case 'fortune':
      return state.phaseStartedAt + p.fortuneMs;
    case 'overtime':
      return null;
    case 'settle':
      return state.phaseStartedAt + p.settleMs;
  }
}

// ───────────────────────────── 时间推进 ─────────────────────────────

function advance(state: RoomState, to: number, config: GameConfig, effects: Effect[]): void {
  while (state.now < to) {
    const boundary = phaseEndsAt(state, config) ?? Number.POSITIVE_INFINITY;
    const chunkEnd = Math.min(to, boundary, state.now + MAX_CHUNK_MS);
    const t0 = state.now;
    state.now = chunkEnd;
    if (state.phase !== 'settle') {
      integrate(state, t0, chunkEnd - t0, config);
      checkWin(state, config, effects);
    }
    const end = phaseEndsAt(state, config);
    if (end !== null && state.now >= end) transition(state, config, effects);
  }
}

/** 持续性推进：鱼苗/全队流 + 终局潮汐自动推进。 */
function integrate(state: RoomState, t0: number, dt: number, config: GameConfig): void {
  if (dt <= 0) return;
  const kept = [];
  for (const f of state.flows) {
    const amount = Math.min(f.remaining, f.perMs * dt);
    f.remaining -= amount;
    gain(state, f.side, amount, f.kind === 'fry' ? 'fry' : 'paid', f.userId, config, t0);
    if (f.remaining > 1e-9) kept.push(f);
  }
  state.flows = kept;
  if (state.phase === 'overtime') {
    const amount = (config.overtimeRatePerSec * dt) / 1000;
    for (const side of SIDES) gain(state, side, amount, 'overtime', null, config, t0);
  }
}

function transition(state: RoomState, config: GameConfig, effects: Effect[]): void {
  const next: Record<RoomState['phase'], RoomState['phase'] | 'new-match'> = {
    charge: 'clash',
    clash: 'fortune',
    fortune: 'overtime',
    overtime: 'overtime',
    settle: 'new-match',
  };
  const target = next[state.phase];
  if (target === 'new-match') {
    startNextMatch(state, config, effects);
    return;
  }
  state.phase = target;
  state.phaseStartedAt = state.now;
  effects.push({ kind: 'phase', at: state.now, phase: target, matchNo: state.matchNo, endsAt: phaseEndsAt(state, config) });
}

function startNextMatch(state: RoomState, config: GameConfig, effects: Effect[]): void {
  const carry = { A: state.sides.A.carry, B: state.sides.B.carry };
  state.matchNo += 1;
  state.phase = 'charge';
  state.phaseStartedAt = state.now;
  state.matchStartedAt = state.now;
  state.sides = { A: newSide(state.sides.A.lossStreak), B: newSide(state.sides.B.lossStreak) };
  state.users = {};
  state.userSeq = 0;
  state.flows = [];
  state.comebackSide = null;
  state.comebackAnnounced = null;
  state.dragonsThisMatch = 0;
  state.result = null;
  effects.push({ kind: 'phase', at: state.now, phase: 'charge', matchNo: state.matchNo, endsAt: phaseEndsAt(state, config) });
  for (const side of SIDES) if (carry[side] > 0) gain(state, side, carry[side], 'paid', null, config, state.now);
}

// ───────────────────────────── 推进与乘数 ─────────────────────────────

/** 人少方产出加权：w = clamp((N多/N少)^exp, 1, max)。 */
export function balanceWeight(state: RoomState, side: SideId, config: GameConfig): number {
  const mine = state.sides[side].members;
  const theirs = state.sides[otherSide(side)].members;
  if (mine === 0 || mine >= theirs) return 1;
  const w = Math.pow(theirs / mine, config.balance.exponent);
  return Math.min(Math.max(w, 1), config.balance.maxWeight);
}

export function lossBonus(sideState: SideState, config: GameConfig): number {
  return Math.min(sideState.lossStreak * config.balance.lossStreakStep, config.balance.lossStreakCap);
}

export function multiplier(state: RoomState, side: SideId, source: GainSource, config: GameConfig, t: number): number {
  if (source === 'overtime') return 1;
  const s = state.sides[side];
  const o = state.sides[otherSide(side)];
  let m = state.phase === 'fortune' ? config.fortuneMultiplier : 1;
  m *= balanceWeight(state, side, config);
  if (state.comebackSide === side) m *= config.balance.comebackBoost;
  m *= 1 + lossBonus(s, config);
  const accelOn = s.accelUntil > t;
  let boost = 0;
  if (accelOn) boost += s.accelBoost;
  if (s.strengthenUntil > t) boost += s.strengthenBoost;
  m *= 1 + boost;
  // 加速克爆发：加速中所受压制减半
  const counter = accelOn ? config.counterFactor : 1;
  if (o.dragonUntil > t) m *= 1 - o.dragonSuppress * counter;
  if (source === 'fry' && o.eliteUntil > t) m *= 1 - o.eliteSuppress * counter;
  return Math.max(m, 0);
}

function gain(
  state: RoomState,
  side: SideId,
  base: number,
  source: GainSource,
  userId: string | null,
  config: GameConfig,
  t: number,
): number {
  if (base <= 0) return 0;
  if (state.phase === 'settle') {
    state.sides[side].carry += base;
    return 0;
  }
  const s = state.sides[side];
  const ceil = phaseCeil(state, config);
  const amount = Math.min(base * multiplier(state, side, source, config, t), Math.max(ceil - s.progress, 0));
  s.progress += amount;
  if (userId !== null) {
    const u = state.users[userId];
    if (u) u.progress += amount;
    s.lastContributor = userId;
  }
  updateComeback(state, config);
  return amount;
}

/** 当前阶段的进度上限（当量）。鸿运/终局潮汐不设上限（可抵达 100%）。 */
function phaseCeil(state: RoomState, config: GameConfig): number {
  switch (state.phase) {
    case 'charge':
      return config.winProgress * config.progressCeil.charge;
    case 'clash':
      return config.winProgress * config.progressCeil.clash;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function updateComeback(state: RoomState, config: GameConfig): void {
  const diff = (state.sides.A.progress - state.sides.B.progress) / config.winProgress;
  const trailing: SideId = diff > 0 ? 'B' : 'A';
  const gap = Math.abs(diff);
  if (state.comebackSide === null) {
    if (gap >= config.balance.comebackOn) state.comebackSide = trailing;
  } else if (gap < config.balance.comebackOff) {
    state.comebackSide = null;
  } else if (trailing !== state.comebackSide && gap >= config.balance.comebackOn) {
    state.comebackSide = trailing;
  }
}

/** 唯一胜负条件：进度达胜负线。同帧双方越线 → 进度高者胜，完全相等 → 平局。 */
function checkWin(state: RoomState, config: GameConfig, effects: Effect[]): void {
  if (state.phase === 'settle') {
    return;
  }
  const crossed = SIDES.filter((s) => state.sides[s].progress >= config.winProgress);
  if (crossed.length === 0) {
    updateComeback(state, config);
    trackComebackEffect(state, effects);
    return;
  }
  let winner: SideId | 'draw';
  if (crossed.length === 1) winner = crossed[0] as SideId;
  else {
    const a = state.sides.A.progress;
    const b = state.sides.B.progress;
    winner = a === b ? 'draw' : a > b ? 'A' : 'B';
  }
  finish(state, winner, config, effects);
}

function trackComebackEffect(state: RoomState, effects: Effect[]): void {
  if (state.comebackAnnounced !== state.comebackSide) {
    state.comebackAnnounced = state.comebackSide;
    effects.push({ kind: 'comeback', at: state.now, side: state.comebackSide });
  }
}

function finish(state: RoomState, winner: SideId | 'draw', config: GameConfig, effects: Effect[]): void {
  const reason = state.phase === 'overtime' ? 'overtime' : 'reach';
  for (const side of SIDES) {
    const s = state.sides[side];
    s.progress = Math.min(s.progress, config.winProgress);
  }
  state.result = buildSettleResult(state, winner, reason, config);
  if (winner !== 'draw') {
    state.sides[winner].lossStreak = 0;
    state.sides[otherSide(winner)].lossStreak += 1;
  }
  state.phase = 'settle';
  state.phaseStartedAt = state.now;
  state.flows = [];
  effects.push({ kind: 'phase', at: state.now, phase: 'settle', matchNo: state.matchNo, endsAt: phaseEndsAt(state, config) });
  effects.push({ kind: 'settle', at: state.now, result: state.result });
}

// ───────────────────────────── 用户与阵营 ─────────────────────────────

function smallerSide(state: RoomState): SideId {
  const a = state.sides.A.members;
  const b = state.sides.B.members;
  if (a !== b) return a < b ? 'A' : 'B';
  return state.sides.A.progress <= state.sides.B.progress ? 'A' : 'B';
}

function ensureUser(state: RoomState, user: LiveUser, preferred: SideId | null, effects: Effect[]): UserState {
  const existing = state.users[user.id];
  if (existing) {
    existing.nick = user.nick;
    return existing;
  }
  const side = preferred ?? smallerSide(state);
  const u: UserState = {
    id: user.id,
    nick: user.nick,
    side,
    seq: state.userSeq++,
    power: 0,
    progress: 0,
    cheers: 0,
    bigGifts: 0,
    dragons: 0,
    lastCommentAt: Number.NEGATIVE_INFINITY,
    likeWindowStart: Number.NEGATIVE_INFINITY,
    likeWindowCount: 0,
  };
  state.users[user.id] = u;
  state.sides[side].members += 1;
  effects.push({ kind: 'join', at: state.now, side, nick: user.nick });
  return u;
}

function addCharge(state: RoomState, side: SideId, amount: number, fromGift: boolean, config: GameConfig, effects: Effect[]): void {
  if (state.phase === 'settle' || amount <= 0) return;
  const s = state.sides[side];
  let add = amount;
  if (fromGift) {
    const room = config.charge.cap * config.charge.giftShareCap - s.giftChargeThisCycle;
    add = Math.min(add, Math.max(room, 0));
    s.giftChargeThisCycle += add;
  }
  s.charge += add;
  if (s.charge >= config.charge.cap) {
    s.charge = 0;
    s.giftChargeThisCycle = 0;
    gain(state, side, config.charge.burstProgress, 'free', null, config, state.now);
    effects.push({ kind: 'surge', at: state.now, side });
  }
}

function sideKeyword(text: string, config: GameConfig): SideId | null {
  const t = text.trim();
  for (const side of SIDES) {
    if (config.sides[side].joinKeywords.some((k) => t === k || t.startsWith(k))) return side;
  }
  return null;
}

// ───────────────────────────── 免费互动 ─────────────────────────────

function onComment(state: RoomState, ev: CommentEvent, config: GameConfig, effects: Effect[]): void {
  if (state.phase === 'settle') {
    effects.push({ kind: 'comment', at: state.now, side: null, nick: ev.user.nick, text: ev.text });
    return;
  }
  const u = ensureUser(state, ev.user, sideKeyword(ev.text, config), effects);
  effects.push({ kind: 'comment', at: state.now, side: u.side, nick: u.nick, text: ev.text });
  if (state.now - u.lastCommentAt < config.free.commentCooldownMs) return;
  u.lastCommentAt = state.now;
  u.cheers += 1;
  u.power += config.free.commentProgress;
  state.sides[u.side].power += config.free.commentProgress;
  gain(state, u.side, config.free.commentProgress, 'free', u.id, config, state.now);
  addCharge(state, u.side, config.free.commentCharge, false, config, effects);
}

function onLike(state: RoomState, ev: LikeEvent, config: GameConfig, effects: Effect[]): void {
  if (state.phase === 'settle') {
    effects.push({ kind: 'like', at: state.now, side: null, nick: ev.user.nick, count: ev.count });
    return;
  }
  const u = ensureUser(state, ev.user, null, effects);
  if (state.now - u.likeWindowStart >= 1000) {
    u.likeWindowStart = state.now;
    u.likeWindowCount = 0;
  }
  const allowed = Math.max(0, Math.min(ev.count, config.free.likePerUserPerSecCap - u.likeWindowCount));
  u.likeWindowCount += allowed;
  effects.push({ kind: 'like', at: state.now, side: u.side, nick: u.nick, count: ev.count });
  if (allowed === 0) return;
  const p = allowed * config.free.likeProgress;
  u.cheers += allowed;
  u.power += p;
  state.sides[u.side].power += p;
  gain(state, u.side, p, 'free', u.id, config, state.now);
  addCharge(state, u.side, allowed * config.free.likeCharge, false, config, effects);
}

// ───────────────────────────── 礼物 ─────────────────────────────

function onGift(state: RoomState, ev: GiftEvent, config: GameConfig, effects: Effect[]): void {
  const count = Math.max(1, Math.floor(ev.count));
  const powerRule = config.tiers[ev.tier];
  const settling = state.phase === 'settle';
  // 结算期：沿用本局阵营（无则人少方），加持兑现到下一局
  const u = settling ? state.users[ev.user.id] ?? null : ensureUser(state, ev.user, null, effects);
  const side = u ? u.side : smallerSide(state);
  const t = state.now;
  const m = multiplier(state, side, 'paid', config, t);

  let effectTier: Tier = ev.tier;
  let nominal = 0;
  const skins: string[] = [];
  let rare = false;
  const items = Math.min(count, MAX_ITEMS_PER_GIFT);

  if (u) {
    u.power += powerRule.power * count;
  }
  state.sides[side].power += powerRule.power * count;

  for (let i = 0; i < items; i++) {
    let tier: Tier = ev.tier;
    // 模式 A 专属：只有指定随机外观款能召唤精英锦鲤
    if (tier === 4 && !ev.randomSkinGift) tier = config.randomSkin.fallbackTier;
    if (tier === 6 && !settling) {
      const full = state.dragonsThisMatch >= config.dragon.perMatch || (u !== null && u.dragons >= config.dragon.perUser);
      if (full) {
        if (i === 0) effects.push({ kind: 'dragon-full', at: t, side, nick: ev.user.nick });
        tier = config.dragon.fallbackTier;
      } else {
        state.dragonsThisMatch += 1;
        if (u) u.dragons += 1;
      }
    }
    effectTier = tier;
    const rule = config.tiers[tier];

    let personal = 1;
    if (ev.tier >= config.whale.fromTier && u) {
      u.bigGifts += 1;
      if (u.bigGifts >= config.whale.fromNth) personal = config.whale.personalShare;
    }
    const p = rule.progress;
    if (settling) {
      state.sides[side].carry += p;
    } else if (rule.delivery === 'flow' && rule.flowMs > 0) {
      addFlow(state, side, 'fry', p * personal, rule.flowMs, u?.id ?? null);
    } else {
      gain(state, side, p * personal, 'paid', u?.id ?? null, config, t);
    }
    if (!settling && personal < 1) addFlow(state, side, 'team', p * (1 - personal), config.whale.teamFlowMs, null);
    nominal += p * m;

    if (!settling) {
      const skin = applyEffect(state, side, rule.effect, ev, i, config, effects);
      if (skin) {
        skins.push(skin.label);
        rare = rare || skin.rare;
      }
      addCharge(state, side, powerRule.power * config.charge.giftChargePerPower, true, config, effects);
    }
  }

  effects.push({
    kind: 'gift',
    at: t,
    side,
    nick: ev.user.nick,
    tier: ev.tier,
    effectTier,
    count,
    label: config.tiers[effectTier].label,
    progressPct: Math.round((nominal / config.winProgress) * 1000) / 10,
    skins,
    rare,
    carried: settling,
  });
  if (!settling && config.tiers[effectTier].effect.kind === 'leap') {
    effects.push({ kind: 'leap', at: t, side, nick: ev.user.nick });
  }
}

function addFlow(state: RoomState, side: SideId, kind: 'fry' | 'team', total: number, durationMs: number, userId: string | null): void {
  if (total <= 0) return;
  state.flows.push({ side, kind, perMs: total / durationMs, remaining: total, userId, items: kind === 'fry' ? 1 : 0 });
}

function counter(effects: Effect[], at: number, side: SideId, kind: CounterKind): void {
  effects.push({ kind: 'counter', at, side, counter: kind });
}

function applyEffect(
  state: RoomState,
  side: SideId,
  effect: TierEffect,
  ev: GiftEvent,
  index: number,
  config: GameConfig,
  effects: Effect[],
): { label: string; rare: boolean } | null {
  const t = state.now;
  const s = state.sides[side];
  const opp = otherSide(side);
  const o = state.sides[opp];
  switch (effect.kind) {
    case 'fry':
    case 'leap':
      return null;
    case 'accel': {
      let boost = effect.boost;
      // 护盾克加速：对方护盾在场时本方加速减半
      if (o.shieldUntil > t) {
        boost *= config.counterFactor;
        counter(effects, t, opp, 'shield-vs-accel');
      }
      s.accelUntil = t + effect.durationMs;
      s.accelBoost = boost;
      return null;
    }
    case 'shield':
      s.shieldUntil = t + effect.durationMs;
      return null;
    case 'strengthen':
      s.strengthenUntil = t + effect.durationMs;
      s.strengthenBoost = effect.boost;
      return null;
    case 'elite': {
      s.eliteUntil = t + effect.durationMs;
      s.eliteSuppress = burstAgainst(state, side, effect.suppressFry, config, effects);
      if (!ev.randomSkinGift) return null;
      const skinRules = config.randomSkin.skins;
      const r = mulberry32(hashString(`${ev.msgId}:${index}`))();
      const skin = skinRules[pickWeighted(skinRules.map((k) => k.weight), r)];
      return skin ? { label: skin.label, rare: skin.rare } : null;
    }
    case 'dragon':
      s.dragonUntil = t + effect.durationMs;
      s.dragonSuppress = burstAgainst(state, side, effect.suppress, config, effects);
      return null;
  }
}

/** 爆发类压制落到对方：爆发克护盾（护盾破碎，吸收一半）；对方加速中则在乘数里再减半。 */
function burstAgainst(state: RoomState, side: SideId, suppress: number, config: GameConfig, effects: Effect[]): number {
  const t = state.now;
  const opp = otherSide(side);
  const o = state.sides[opp];
  let value = suppress;
  if (o.shieldUntil > t) {
    o.shieldUntil = t;
    value *= config.counterFactor;
    counter(effects, t, side, 'burst-vs-shield');
  }
  if (o.accelUntil > t) counter(effects, t, opp, 'accel-vs-burst');
  return value;
}
