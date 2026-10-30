/**
 * 统一直播互动事件模型（LiveEvent）与平台适配器接口。
 *
 * 这是 server / core / client 三端唯一的事件类型来源。任何平台（本地抓取流、
 * 抖音官方推送、快手官方推送……）都必须先经适配器归一化为 LiveEvent，
 * core 只认识 LiveEvent，不认识任何平台。
 */

/** 礼物价值档位 T0~T7。效果只挂在档位上，不绑定任何平台礼物 ID。 */
export type Tier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const TIERS: readonly Tier[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** 直播间用户（已由管道完成昵称过滤与截断，可直接展示）。 */
export interface LiveUser {
  /** 平台内用户标识（仅用于房间内归属，不做跨平台归并）。 */
  id: string;
  /** 展示昵称：已过词表过滤，命中禁用词时为打码形态。 */
  nick: string;
  /** 粉丝团等级（平台提供时）。 */
  fansLevel?: number;
}

interface LiveEventBase {
  /** 幂等键：同一来源的同一条消息必须得到相同的键。 */
  msgId: string;
  /** 事件发生时间（毫秒时间戳），core 以此驱动时间。 */
  ts: number;
  roomId: string;
  user: LiveUser;
}

/** 弹幕。text 已过词表过滤。 */
export interface CommentEvent extends LiveEventBase {
  type: 'comment';
  text: string;
}

/** 点赞（一条消息可能聚合多次点赞）。 */
export interface LikeEvent extends LiveEventBase {
  type: 'like';
  count: number;
}

/**
 * 礼物。只携带档位，不携带金额——金额止于管道（见 live-event-pipeline 规格）。
 */
export interface GiftEvent extends LiveEventBase {
  type: 'gift';
  tier: Tier;
  /** 本条消息代表的礼物个数（连击已按增量拆分）。 */
  count: number;
  /** 是否为本平台唯一指定的随机外观款（模式 A）。 */
  randomSkinGift: boolean;
}

export interface FollowEvent extends LiveEventBase {
  type: 'follow';
}

export interface JoinEvent extends LiveEventBase {
  type: 'join';
}

export type LiveEvent = CommentEvent | LikeEvent | GiftEvent | FollowEvent | JoinEvent;

export type LiveEventType = LiveEvent['type'];

/** 适配器连接状态。 */
export type AdapterStatus =
  | { state: 'connecting' }
  | { state: 'connected' }
  | { state: 'disconnected'; reason: string; retryInMs: number }
  | { state: 'closed' };

/**
 * 平台适配器统一接口。每个平台一个实现；新增平台不得修改 core。
 */
export interface PlatformAdapter {
  /** 适配器名称，如 "local-grab"、"sim"、"douyin"。 */
  readonly name: string;
  /** 建立连接并开始产出事件。 */
  connect(): Promise<void>;
  /** 断开连接并停止产出事件。 */
  close(): Promise<void>;
  /** 订阅归一化后的事件，返回取消订阅函数。 */
  onEvent(handler: (event: LiveEvent) => void): () => void;
  /** 订阅连接状态变化，返回取消订阅函数。 */
  onStatus(handler: (status: AdapterStatus) => void): () => void;
}
