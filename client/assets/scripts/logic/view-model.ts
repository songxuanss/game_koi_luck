/**
 * 视图模型：把 core 的快照与效果转成渲染所需数据与"反馈队列"。
 * 纯逻辑、无 cc 依赖，可在 Node 下单测。外显文案均来自配置标签或固定占位，且过词表。
 */
import { findBanned, maskText } from '../generated/shared';
import type { Effect, Phase, Snapshot } from '../generated/core';

export interface FeedItem {
  id: number;
  at: number;
  text: string;
  tone: 'chat' | 'like' | 'gift' | 'rare' | 'system';
  /** 展示截止时间（毫秒，与 snapshot.now 同一时钟）。 */
  until: number;
}

export interface Banner {
  text: string;
  until: number;
}

export type VisualEventKind = 'ripple' | 'gift' | 'surge' | 'counter' | 'comeback' | 'leap' | 'settle';

export interface VisualEvent {
  id: number;
  kind: VisualEventKind;
  side: 'A' | 'B' | null;
  tier: number;
  rare: boolean;
  progressPct: number;
  at: number;
  until: number;
}

export const PHASE_LABEL: Record<Phase, string> = {
  charge: '蓄势',
  clash: '攻防',
  fortune: '鸿运时刻',
  overtime: '终局潮汐',
  settle: '结算',
};

const FEED_MAX = 4;
const FEED_TTL_MS = 6000;
const BANNER_TTL_MS = 3500;
const VISUAL_EVENT_MAX = 24;

/** 外显文案出口：统一过词表，命中即打码。 */
export function safeText(text: string): string {
  return findBanned(text).length > 0 ? maskText(text) : text;
}

export function effectToFeed(e: Effect, sideNames: { A: string; B: string }): { text: string; tone: FeedItem['tone'] } | null {
  switch (e.kind) {
    case 'comment':
      return { text: `${e.nick}：${e.text}`, tone: 'chat' };
    case 'like':
      return { text: `${e.nick} 点亮了 ${e.count} 次`, tone: 'like' };
    case 'join':
      return { text: `${e.nick} 加入了${sideNames[e.side]}`, tone: 'system' };
    case 'gift': {
      const skin = e.skins.length > 0 ? `·${e.skins.join('')}` : '';
      const gain = e.progressPct > 0 ? `，进度 +${e.progressPct}%` : '';
      const carry = e.carried ? '（计入下一局）' : '';
      return { text: `${e.nick} ${e.label}${e.count > 1 ? ` ×${e.count}` : ''}${skin}${gain}${carry}`, tone: e.rare ? 'rare' : 'gift' };
    }
    case 'surge':
      return { text: `${sideNames[e.side]} 全民锦鲤潮！`, tone: 'system' };
    case 'counter':
      return { text: '巧！克制命中', tone: 'system' };
    case 'dragon-full':
      return { text: `${e.nick} 的神龙名额已满，改为全队强化`, tone: 'system' };
    default:
      return null;
  }
}

export class ViewModel {
  feed: FeedItem[] = [];
  visualEvents: VisualEvent[] = [];
  banner: Banner | null = null;
  snapshot: Snapshot | null = null;
  private nextId = 1;

  constructor(private readonly sideNames: { A: string; B: string }) {}

  /** 应用一帧：更新快照、追加反馈、触发横幅。 */
  apply(snapshot: Snapshot, effects: Effect[]): void {
    this.snapshot = snapshot;
    const now = snapshot.now;
    for (const e of effects) {
      const item = effectToFeed(e, this.sideNames);
      if (item) this.feed.push({ id: this.nextId++, at: e.at, text: safeText(item.text), tone: item.tone, until: now + FEED_TTL_MS });
      const visual = this.visualFor(e);
      if (visual) this.visualEvents.push({ ...visual, id: this.nextId++, at: e.at, until: now + this.visualTtl(visual.kind) });
      const banner = this.bannerFor(e);
      if (banner) this.banner = { text: safeText(banner), until: now + BANNER_TTL_MS };
    }
    this.feed = this.feed.filter((f) => f.until > now).slice(-FEED_MAX);
    this.visualEvents = this.visualEvents.filter((event) => event.until > now).slice(-VISUAL_EVENT_MAX);
    if (this.banner && this.banner.until <= now) this.banner = null;
  }

  private visualFor(e: Effect): Omit<VisualEvent, 'id' | 'at' | 'until'> | null {
    const base = { side: null, tier: 0, rare: false, progressPct: 0 } as const;
    switch (e.kind) {
      case 'like':
        return { ...base, kind: 'ripple', side: e.side };
      case 'gift':
        return { kind: 'gift', side: e.side, tier: e.effectTier, rare: e.rare, progressPct: e.progressPct };
      case 'surge':
        return { ...base, kind: 'surge', side: e.side };
      case 'counter':
        return { ...base, kind: 'counter', side: e.side };
      case 'comeback':
        return e.side ? { ...base, kind: 'comeback', side: e.side } : null;
      case 'leap':
        return { ...base, kind: 'leap', side: e.side, rare: true };
      case 'settle':
        return { ...base, kind: 'settle', side: e.result.winner === 'draw' ? null : e.result.winner, rare: true };
      default:
        return null;
    }
  }

  private visualTtl(kind: VisualEventKind): number {
    switch (kind) {
      case 'ripple': return 1200;
      case 'gift': return 2200;
      case 'counter': return 1800;
      case 'surge':
      case 'comeback': return 2600;
      case 'leap': return 4000;
      case 'settle': return 5000;
    }
  }

  private bannerFor(e: Effect): string | null {
    switch (e.kind) {
      case 'phase':
        return e.phase === 'settle' ? null : `${PHASE_LABEL[e.phase]}`;
      case 'leap':
        return `${e.nick} 鲤跃龙门！`;
      case 'settle': {
        const w = e.result.winner;
        return w === 'draw' ? '平分秋色' : `${this.sideNames[w]} 获胜`;
      }
      case 'comeback':
        return e.side ? `${this.sideNames[e.side]} 逆流而上` : null;
      default:
        return null;
    }
  }

  /** 距阶段结束的剩余秒数（终局潮汐为 null）。 */
  countdownSec(): number | null {
    const s = this.snapshot;
    if (!s || s.phaseEndsAt === null) return null;
    return Math.max(0, Math.ceil((s.phaseEndsAt - s.now) / 1000));
  }
}

export function phaseCue(snapshot: Snapshot): string {
  switch (snapshot.phase) {
    case 'charge': return '弹幕选择阵营，点亮夜河';
    case 'clash': return '点赞聚势，潮满自动释放';
    case 'fortune': return '鸿运加持，全场效果翻倍';
    case 'overtime': return '终局潮汐，坚持到彼岸';
    case 'settle': return '灯会留名，下一场即将启程';
  }
}

export function momentumText(snapshot: Snapshot): string {
  if (snapshot.phase === 'settle') return '夜河已定 · 感谢同行';
  const delta = snapshot.sides.A.progress - snapshot.sides.B.progress;
  if (Math.abs(delta) < 0.03) return '势均力敌 · 潮声正起';
  const leader = delta > 0 ? snapshot.sides.A.name : snapshot.sides.B.name;
  return `${leader} 领跑 ${Math.round(Math.abs(delta) * 100)}% · 仍有追潮机会`;
}

export function sideStatus(snapshot: Snapshot, side: 'A' | 'B'): string {
  const s = snapshot.sides[side];
  const states: string[] = [];
  if (s.shield) states.push('护盾');
  if (s.accel) states.push('加速');
  if (s.strengthen) states.push('强化');
  if (s.dragon) states.push('神龙');
  if (s.suppressed) states.push('受潮汐压制');
  if (s.comeback) states.push('逆流');
  return states.length > 0 ? states.join(' · ') : `潮涌 ${Math.round(s.charge * 100)}%`;
}
