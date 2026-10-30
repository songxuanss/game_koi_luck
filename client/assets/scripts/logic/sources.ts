/**
 * 数据源：demo（本地内核 + 模拟剧本，无 server 完整演示）与 net（WS 消费 server 帧）。
 */
import { DEFAULT_CONFIG, DEFAULT_SIM, generateSimEvents, type GameConfig, type LiveEvent } from '../generated/shared';
import { createRoomState, snapshot, step, type Effect, type RoomState, type Snapshot } from '../generated/core';

export interface FrameData {
  snapshot: Snapshot;
  effects: Effect[];
}

export interface FrameSource {
  /** 推进到 nowMs（demo 为虚拟时钟），并返回自上次以来的帧（可能为空）。 */
  poll(nowMs: number): FrameData | null;
}

export interface DemoOptions {
  roomId?: string;
  seed?: number;
  /** 虚拟时间加速倍率（演示一局只需 ~14 分钟，可加速）。 */
  speed?: number;
  config?: GameConfig;
}

/** 本地内核驱动的演示源：无 server 也能完整跑一局。 */
export class DemoSource implements FrameSource {
  private readonly config: GameConfig;
  private readonly state: RoomState;
  private events: LiveEvent[];
  private cursor = 0;
  private loops = 0;
  private readonly seed: number;
  private readonly roomId: string;
  private virtual = 0;
  private lastRealMs: number | null = null;
  private readonly speed: number;
  private lastTick = 0;

  constructor(opts: DemoOptions = {}) {
    this.config = opts.config ?? DEFAULT_CONFIG;
    this.speed = opts.speed ?? 1;
    this.roomId = opts.roomId ?? 'demo-room';
    this.seed = opts.seed ?? DEFAULT_SIM.seed;
    this.state = createRoomState(this.roomId, 0);
    this.events = this.script(0);
  }

  poll(nowMs: number): FrameData | null {
    const dt = this.lastRealMs === null ? 0 : nowMs - this.lastRealMs;
    this.lastRealMs = nowMs;
    this.virtual += dt * this.speed;
    const effects: Effect[] = [];
    while (this.cursor < this.events.length && (this.events[this.cursor]?.ts ?? Infinity) <= this.virtual) {
      effects.push(...step(this.state, this.events[this.cursor++]!, this.config).effects);
    }
    while (this.lastTick + 200 <= this.virtual) {
      this.lastTick += 200;
      effects.push(...step(this.state, { type: 'tick', ts: this.lastTick }, this.config).effects);
    }
    // 剧本播完后接续：从当前虚拟时间起生成下一段新剧本（换种子），演示不断且不重放旧事件
    if (this.cursor >= this.events.length) {
      this.loops++;
      this.events = this.script(this.virtual);
      this.cursor = 0;
    }
    return { snapshot: snapshot(this.state, this.config), effects };
  }

  private script(startTs: number): LiveEvent[] {
    return generateSimEvents({ ...DEFAULT_SIM, seed: this.seed + this.loops, roomId: this.roomId, startTs, durationMs: 14 * 60 * 1000 });
  }

  /** 当前内核状态（测试/截图用）。 */
  get matchNo(): number {
    return this.state.matchNo;
  }
}

/** 网络源：解析 server 广播的 Frame JSON。 */
export class NetSource implements FrameSource {
  private queue: FrameData[] = [];
  private socket: { close(): void } | null = null;

  constructor(private readonly url: string, private readonly makeSocket: (url: string) => WebSocketLike = (u) => new WebSocket(u)) {}

  connect(onStatus?: (s: 'open' | 'closed') => void): void {
    const ws = this.makeSocket(this.url);
    this.socket = ws;
    ws.onopen = () => onStatus?.('open');
    ws.onclose = () => onStatus?.('closed');
    ws.onmessage = (m) => this.ingest(typeof m.data === 'string' ? m.data : '');
  }

  ingest(text: string): void {
    try {
      const msg = JSON.parse(text) as { type?: string; snapshot?: Snapshot; effects?: Effect[] };
      if (msg.type === 'frame' && msg.snapshot) this.queue.push({ snapshot: msg.snapshot, effects: msg.effects ?? [] });
    } catch {
      /* 忽略非法帧 */
    }
  }

  poll(): FrameData | null {
    if (this.queue.length === 0) return null;
    const frames = this.queue;
    this.queue = [];
    return { snapshot: frames[frames.length - 1]!.snapshot, effects: frames.flatMap((f) => f.effects) };
  }

  close(): void {
    this.socket?.close();
  }
}

export interface WebSocketLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onopen: ((ev: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onclose: ((ev: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessage: ((m: any) => void) | null;
  close(): void;
}
