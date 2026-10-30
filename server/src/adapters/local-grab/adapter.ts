/**
 * local-grab-adapter：作为 WS 客户端接入本地抓取工具的消息流。
 * ⚠ 仅限 V0 验证轨（Goal R3b）：可弃置测试号、≤5 熟人主播、T0 后停用；不进软著材料、不进官方提审包。
 */
import WebSocket from 'ws';
import type { AdapterStatus, LiveEvent, PlatformAdapter } from '@jinli/shared';
import { DOUYIN_CATALOG, type GiftCatalog } from '../../gift-catalog';
import { LocalGrabNormalizer } from './normalizer';

export interface LocalGrabOptions {
  url: string;
  roomId: string;
  catalog?: GiftCatalog;
  now?: () => number;
  /** 重连退避：初始/上限（毫秒）。 */
  backoffInitialMs?: number;
  backoffMaxMs?: number;
  /** 文本 ping 间隔（毫秒），默认 20s。 */
  pingMs?: number;
  log?: (msg: string) => void;
}

export class LocalGrabAdapter implements PlatformAdapter {
  readonly name = 'local-grab';
  private ws: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private readonly eventHandlers = new Set<(e: LiveEvent) => void>();
  private readonly statusHandlers = new Set<(s: AdapterStatus) => void>();
  readonly normalizer: LocalGrabNormalizer;
  /** 运行统计（不含用户信息，可安全落日志）。 */
  readonly stats = { messages: 0, events: 0, unknown: 0, reconnects: 0 };

  constructor(private readonly opts: LocalGrabOptions) {
    this.normalizer = new LocalGrabNormalizer({
      roomId: opts.roomId,
      catalog: opts.catalog ?? DOUYIN_CATALOG,
      now: opts.now ?? Date.now,
      onSystem: (s) => opts.log?.(`local-grab room status ${s.event}${s.code ? ` ${s.code}` : ''}`),
      onUnknown: (info) => {
        this.stats.unknown++;
        opts.log?.(`local-grab unknown message method=${info.method ?? '-'} reason=${info.reason}`);
      },
    });
  }

  connect(): Promise<void> {
    this.closed = false;
    return new Promise((resolve) => {
      let first = true;
      const open = () => {
        this.emitStatus({ state: 'connecting' });
        const ws = new WebSocket(this.opts.url);
        this.ws = ws;
        ws.on('open', () => {
          this.attempt = 0;
          this.emitStatus({ state: 'connected' });
          this.opts.log?.('local-grab connected');
          // 抓取工具协议：文本 ping → pong 保活
          if (this.pingTimer) clearInterval(this.pingTimer);
          this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), this.opts.pingMs ?? 20_000);
          if (first) {
            first = false;
            resolve();
          }
        });
        ws.on('message', (data) => this.onMessage(data.toString()));
        ws.on('error', () => {
          /* 交给 close 处理重连 */
        });
        ws.on('close', () => {
          if (this.pingTimer) clearInterval(this.pingTimer);
          this.ws = null;
          if (this.closed) return;
          const delay = this.nextDelay();
          this.stats.reconnects++;
          this.emitStatus({ state: 'disconnected', reason: 'socket-closed', retryInMs: delay });
          this.retryTimer = setTimeout(open, delay);
          if (first) {
            first = false;
            resolve();
          }
        });
      };
      open();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      await new Promise<void>((resolve) => {
        ws.once('close', () => resolve());
        ws.close();
      });
    }
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

  private onMessage(text: string): void {
    this.stats.messages++;
    for (const ev of this.normalizer.normalize(text)) {
      this.stats.events++;
      for (const h of this.eventHandlers) h(ev);
    }
  }

  /** 指数退避 + 上限。 */
  private nextDelay(): number {
    const initial = this.opts.backoffInitialMs ?? 500;
    const max = this.opts.backoffMaxMs ?? 15_000;
    const delay = Math.min(max, initial * 2 ** this.attempt);
    this.attempt++;
    return delay;
  }

  private emitStatus(s: AdapterStatus): void {
    for (const h of this.statusHandlers) h(s);
  }
}
