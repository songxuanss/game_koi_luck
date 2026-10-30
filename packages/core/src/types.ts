/**
 * core 对局内核的状态、输入与输出类型。
 * 输出（Effect / Snapshot / SettleResult）只含助力值、进度比例与展示信息，绝无金额字段。
 */
import type { LiveEvent, SideId, Tier } from '@jinli/shared';

export type Phase = 'charge' | 'clash' | 'fortune' | 'overtime' | 'settle';

/** 时钟推进输入（由外壳按固定节拍注入，携带显式时间戳）。 */
export interface TickInput {
  type: 'tick';
  ts: number;
}

export type CoreInput = LiveEvent | TickInput;

/** 持续兑现的推进（鱼苗单位 / 防鲸差额转全队）。 */
export interface Flow {
  side: SideId;
  kind: 'fry' | 'team';
  perMs: number;
  remaining: number;
  userId: string | null;
  items: number;
}

export interface SideState {
  /** 进度（当量，0~winProgress；结算判定瞬间可短暂越线）。 */
  progress: number;
  members: number;
  /** 本方累计助力值。 */
  power: number;
  charge: number;
  giftChargeThisCycle: number;
  accelUntil: number;
  accelBoost: number;
  strengthenUntil: number;
  strengthenBoost: number;
  shieldUntil: number;
  /** 本方精英锦鲤：压制对方鱼苗产出。 */
  eliteUntil: number;
  eliteSuppress: number;
  /** 本方神龙：压制对方全体推进。 */
  dragonUntil: number;
  dragonSuppress: number;
  /** 连败场次（跨局保留）。 */
  lossStreak: number;
  /** 本局结算期送出的加持，下一局开局兑现。 */
  carry: number;
  lastContributor: string | null;
}

export interface UserState {
  id: string;
  nick: string;
  side: SideId;
  seq: number;
  power: number;
  progress: number;
  cheers: number;
  bigGifts: number;
  dragons: number;
  lastCommentAt: number;
  likeWindowStart: number;
  likeWindowCount: number;
}

export interface RankEntry {
  nick: string;
  side: SideId;
  power: number;
  /** 个人推进占本方总进度百分比（个人归因，方案 5.7.A）。 */
  contributionPct: number;
}

export interface CheerEntry {
  nick: string;
  side: SideId;
  cheers: number;
}

export interface SettleResult {
  matchNo: number;
  winner: SideId | 'draw';
  reason: 'reach' | 'overtime';
  durationMs: number;
  /** 关键先生：打出越线一击者。 */
  keyPlayer: { nick: string; side: SideId } | null;
  ranks: RankEntry[];
  cheers: CheerEntry[];
  participants: number;
  /** 幸运星确定性发放（模式 B 免费资源）：胜方/平局每人 base+bonus，败方每人 base。 */
  stars: { winnerEach: number; loserEach: number };
}

export interface RoomState {
  roomId: string;
  matchNo: number;
  phase: Phase;
  phaseStartedAt: number;
  matchStartedAt: number;
  now: number;
  sides: Record<SideId, SideState>;
  users: Record<string, UserState>;
  userSeq: number;
  flows: Flow[];
  comebackSide: SideId | null;
  /** 已对外播报的逆流状态（去抖）。 */
  comebackAnnounced: SideId | null;
  dragonsThisMatch: number;
  result: SettleResult | null;
}

export type CounterKind = 'accel-vs-burst' | 'shield-vs-accel' | 'burst-vs-shield';

export type Effect =
  | { kind: 'phase'; at: number; phase: Phase; matchNo: number; endsAt: number | null }
  | { kind: 'join'; at: number; side: SideId; nick: string }
  | { kind: 'enter'; at: number; nick: string }
  | { kind: 'follow'; at: number; nick: string }
  | { kind: 'comment'; at: number; side: SideId | null; nick: string; text: string }
  | { kind: 'like'; at: number; side: SideId | null; nick: string; count: number }
  | {
      kind: 'gift';
      at: number;
      side: SideId;
      nick: string;
      tier: Tier;
      effectTier: Tier;
      count: number;
      label: string;
      /** 本次送礼推进本方进度的百分比（个人归因）。 */
      progressPct: number;
      skins: string[];
      rare: boolean;
      /** 结算期送出：兑现到下一局开局。 */
      carried: boolean;
    }
  | { kind: 'surge'; at: number; side: SideId }
  | { kind: 'counter'; at: number; side: SideId; counter: CounterKind }
  | { kind: 'dragon-full'; at: number; side: SideId; nick: string }
  | { kind: 'comeback'; at: number; side: SideId | null }
  | { kind: 'leap'; at: number; side: SideId; nick: string }
  | { kind: 'settle'; at: number; result: SettleResult };

export interface SideView {
  name: string;
  /** 进度比例 0~1。 */
  progress: number;
  members: number;
  power: number;
  /** 集体充能比例 0~1。 */
  charge: number;
  accel: boolean;
  strengthen: boolean;
  shield: boolean;
  elite: boolean;
  dragon: boolean;
  /** 正被对方神龙压制。 */
  suppressed: boolean;
  comeback: boolean;
  fry: number;
  lossBonus: number;
}

export interface Snapshot {
  roomId: string;
  matchNo: number;
  phase: Phase;
  now: number;
  phaseEndsAt: number | null;
  sides: Record<SideId, SideView>;
  top: RankEntry[];
  cheers: CheerEntry[];
  result: SettleResult | null;
}
