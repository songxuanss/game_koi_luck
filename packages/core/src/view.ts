import type { GameConfig } from '@jinli/shared';
import { phaseEndsAt } from './kernel';
import { toSnapshot } from './snapshot';
import type { RoomState, Snapshot } from './types';

/** 生成当前房间快照（供广播/渲染）。 */
export function snapshot(state: RoomState, config: GameConfig): Snapshot {
  return toSnapshot(state, config, phaseEndsAt(state, config));
}
