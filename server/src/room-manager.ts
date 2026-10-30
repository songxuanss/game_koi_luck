/**
 * RoomManager：core 内核的外壳——房间生命周期、时钟驱动、配置热更新、快照广播。
 * 这里允许读实时钟与定时器（内核不允许）；时钟与定时器均可注入，便于测试与压测。
 */
import { createRoomState, snapshot, step, type CoreInput, type Effect, type RoomState, type Snapshot } from '@jinli/core';
import type { GameConfig, LiveEvent } from '@jinli/shared';
import { parseGameConfig } from '@jinli/shared/schema';

export interface Frame {
  type: 'frame';
  roomId: string;
  seq: number;
  /** 广播发出时间（服务端时钟）。 */
  sentAt: number;
  snapshot: Snapshot;
  effects: Effect[];
}

export type FrameListener = (frame: Frame) => void;

interface Room {
  id: string;
  state: RoomState;
  config: GameConfig;
  pending: Effect[];
  listeners: Set<FrameListener>;
  seq: number;
  lastActivity: number;
}

export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface RoomManagerOptions {
  config: GameConfig;
  now?: () => number;
  tickMs?: number;
  broadcastMs?: number;
  /** 无订阅且无事件超过该时长的房间被回收。 */
  idleRoomMs?: number;
  scheduler?: Scheduler;
}

const realScheduler: Scheduler = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private config: GameConfig;
  private pendingConfig: GameConfig | null = null;
  private readonly now: () => number;
  private readonly scheduler: Scheduler;
  private handles: unknown[] = [];
  readonly stats = { events: 0, frames: 0, roomsCreated: 0, roomsClosed: 0 };

  constructor(private readonly opts: RoomManagerOptions) {
    this.config = parseGameConfig(opts.config);
    this.now = opts.now ?? Date.now;
    this.scheduler = opts.scheduler ?? realScheduler;
  }

  start(): void {
    if (this.handles.length > 0) return;
    this.handles.push(this.scheduler.setInterval(() => this.tickAll(), this.opts.tickMs ?? 200));
    this.handles.push(this.scheduler.setInterval(() => this.flushAll(), this.opts.broadcastMs ?? 100));
  }

  stop(): void {
    for (const h of this.handles) this.scheduler.clearInterval(h);
    this.handles = [];
  }

  /** 事件入口：按 roomId 路由，房间不存在则开局。 */
  ingest(event: LiveEvent): void {
    this.stats.events++;
    const room = this.ensureRoom(event.roomId);
    room.lastActivity = this.now();
    this.apply(room, event);
  }

  /** 配置热更新：校验后按策略生效（立即 / 下一局）。返回生效方式。 */
  setConfig(input: unknown): 'immediate' | 'next-match' {
    const cfg = parseGameConfig(input);
    this.config = cfg;
    if (cfg.hotReload === 'immediate') {
      for (const room of this.rooms.values()) room.config = cfg;
      this.pendingConfig = null;
      return 'immediate';
    }
    this.pendingConfig = cfg;
    return 'next-match';
  }

  subscribe(roomId: string, listener: FrameListener): () => void {
    const room = this.ensureRoom(roomId);
    room.listeners.add(listener);
    return () => {
      room.listeners.delete(listener);
      room.lastActivity = this.now();
    };
  }

  getSnapshot(roomId: string): Snapshot | null {
    const room = this.rooms.get(roomId);
    return room ? snapshot(room.state, room.config) : null;
  }

  getRoomConfigVersion(roomId: string): string | null {
    return this.rooms.get(roomId)?.config.version ?? null;
  }

  roomIds(): string[] {
    return [...this.rooms.keys()];
  }

  closeRoom(roomId: string): void {
    if (this.rooms.delete(roomId)) this.stats.roomsClosed++;
  }

  /** 时钟推进所有房间；同时回收闲置房间。 */
  tickAll(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      this.apply(room, { type: 'tick', ts: now });
      const idle = this.opts.idleRoomMs;
      if (idle !== undefined && room.listeners.size === 0 && now - room.lastActivity > idle) this.closeRoom(room.id);
    }
  }

  /** 广播：每房间合并本周期效果 + 最新快照为一帧。 */
  flushAll(): void {
    const sentAt = this.now();
    for (const room of this.rooms.values()) {
      if (room.listeners.size === 0) {
        room.pending = [];
        continue;
      }
      const frame: Frame = {
        type: 'frame',
        roomId: room.id,
        seq: room.seq++,
        sentAt,
        snapshot: snapshot(room.state, room.config),
        effects: room.pending,
      };
      room.pending = [];
      this.stats.frames++;
      for (const l of room.listeners) l(frame);
    }
  }

  private apply(room: Room, input: CoreInput): void {
    // 下一局生效：房间处于结算期即换上新配置，新局从开局起按新数值结算
    if (this.pendingConfig && room.state.phase === 'settle' && room.config !== this.pendingConfig) {
      room.config = this.pendingConfig;
    }
    const { effects } = step(room.state, input, room.config);
    if (effects.length > 0) room.pending.push(...effects);
  }

  private ensureRoom(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      const now = this.now();
      room = {
        id: roomId,
        state: createRoomState(roomId, now),
        config: this.config,
        pending: [],
        listeners: new Set(),
        seq: 0,
        lastActivity: now,
      };
      this.rooms.set(roomId, room);
      this.stats.roomsCreated++;
    }
    return room;
  }
}
