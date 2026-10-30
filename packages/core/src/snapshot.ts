/**
 * 对外输出：结算结果与房间快照。只含助力值、进度比例与展示信息，无金额字段。
 */
import { otherSide, type GameConfig, type SideId } from '@jinli/shared';
import type { CheerEntry, RankEntry, RoomState, SettleResult, Snapshot, SideView, UserState } from './types';

function byPower(a: UserState, b: UserState): number {
  return b.power - a.power || a.seq - b.seq;
}

function byCheers(a: UserState, b: UserState): number {
  return b.cheers - a.cheers || a.seq - b.seq;
}

function rankEntry(state: RoomState, u: UserState): RankEntry {
  const sideProgress = state.sides[u.side].progress;
  const pct = sideProgress > 0 ? (u.progress / sideProgress) * 100 : 0;
  return { nick: u.nick, side: u.side, power: Math.round(u.power), contributionPct: Math.round(pct * 10) / 10 };
}

export function topRanks(state: RoomState, n: number): RankEntry[] {
  return Object.values(state.users).sort(byPower).slice(0, n).map((u) => rankEntry(state, u));
}

export function topCheers(state: RoomState, n: number): CheerEntry[] {
  return Object.values(state.users)
    .filter((u) => u.cheers > 0)
    .sort(byCheers)
    .slice(0, n)
    .map((u) => ({ nick: u.nick, side: u.side, cheers: u.cheers }));
}

export function buildSettleResult(
  state: RoomState,
  winner: SideId | 'draw',
  reason: 'reach' | 'overtime',
  config: GameConfig,
): SettleResult {
  let keyPlayer: SettleResult['keyPlayer'] = null;
  if (winner !== 'draw') {
    const id = state.sides[winner].lastContributor;
    const u = id !== null ? state.users[id] : undefined;
    if (u) keyPlayer = { nick: u.nick, side: u.side };
  }
  const base = config.settle.starsBase;
  return {
    matchNo: state.matchNo,
    winner,
    reason,
    durationMs: state.now - state.matchStartedAt,
    keyPlayer,
    ranks: topRanks(state, config.settle.topN),
    cheers: topCheers(state, 3),
    participants: Object.keys(state.users).length,
    stars: { winnerEach: base + config.settle.starsWinBonus, loserEach: winner === 'draw' ? base + config.settle.starsWinBonus : base },
  };
}

function sideView(state: RoomState, side: SideId, config: GameConfig): SideView {
  const s = state.sides[side];
  const o = state.sides[otherSide(side)];
  const t = state.now;
  return {
    name: config.sides[side].name,
    progress: Math.min(s.progress / config.winProgress, 1),
    members: s.members,
    power: Math.round(s.power),
    charge: Math.min(s.charge / config.charge.cap, 1),
    accel: s.accelUntil > t,
    strengthen: s.strengthenUntil > t,
    shield: s.shieldUntil > t,
    elite: s.eliteUntil > t,
    dragon: s.dragonUntil > t,
    suppressed: o.dragonUntil > t,
    comeback: state.comebackSide === side,
    fry: state.flows.filter((f) => f.side === side && f.kind === 'fry').length,
    lossBonus: Math.min(s.lossStreak * config.balance.lossStreakStep, config.balance.lossStreakCap),
  };
}

export function toSnapshot(state: RoomState, config: GameConfig, phaseEndsAt: number | null): Snapshot {
  return {
    roomId: state.roomId,
    matchNo: state.matchNo,
    phase: state.phase,
    now: state.now,
    phaseEndsAt,
    sides: { A: sideView(state, 'A', config), B: sideView(state, 'B', config) },
    top: topRanks(state, 5),
    cheers: topCheers(state, 3),
    result: state.result,
  };
}


