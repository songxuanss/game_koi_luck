/**
 * 模拟适配器：按真实时间回放确定性模拟剧本（demo / 联调 / 无直播间时的演示）。
 */
import { DEFAULT_SIM, generateSimEvents, type AdapterStatus, type LiveEvent, type PlatformAdapter, type SimOptions } from '@jinli/shared';

export class SimAdapter implements PlatformAdapter {
  readonly name = 'sim';
  private timer: NodeJS.Timeout | null = null;
  private readonly eventHandlers = new Set<(e: LiveEvent) => void>();
  private readonly statusHandlers = new Set<(s: AdapterStatus) => void>();
  private loop = 0;

  constructor(
    private readonly opts: Partial<Omit<SimOptions, 'startTs'>> = {},
    private readonly now: () => number = Date.now,
  ) {}

  async connect(): Promise<void> {
    this.emitStatus({ state: 'connected' });
    this.playLoop();
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.emitStatus({ state: 'closed' });
  }

  onEvent(handler: (e: LiveEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatus(handler: (s: AdapterStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private playLoop(): void {
    const startTs = this.now();
    const options = { ...DEFAULT_SIM, ...this.opts, seed: (this.opts.seed ?? DEFAULT_SIM.seed) + this.loop++, startTs };
    const events = generateSimEvents(options);
    let i = 0;
    const pump = () => {
      const now = this.now();
      while (i < events.length && (events[i]?.ts ?? Infinity) <= now) {
        const ev = events[i++]!;
        for (const h of this.eventHandlers) h({ ...ev, ts: now });
      }
      if (i >= events.length) {
        this.playLoop();
        return;
      }
      this.timer = setTimeout(pump, 50);
    };
    pump();
  }

  private emitStatus(s: AdapterStatus): void {
    for (const h of this.statusHandlers) h(s);
  }
}
