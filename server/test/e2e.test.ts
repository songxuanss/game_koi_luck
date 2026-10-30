import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { DEFAULT_CONFIG } from '@jinli/shared';
import { LocalGrabAdapter, RoomManager, startBroadcast, type Frame } from '../src';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => (cond() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timeout')) : setTimeout(poll, 10));
    poll();
  });
}

describe('end to end: grab tool → adapter → core → broadcast → client socket', () => {
  it('shows a real chat line and settles a real gift tier within 3s', async () => {
    const grab = new WebSocketServer({ port: 0 });
    cleanups.push(() => new Promise<void>((r) => grab.close(() => r())));
    await new Promise((r) => grab.on('listening', r));
    const grabPort = (grab.address() as { port: number }).port;

    const rooms = new RoomManager({ config: DEFAULT_CONFIG, tickMs: 50, broadcastMs: 50 });
    rooms.start();
    cleanups.push(() => rooms.stop());
    const server = await startBroadcast(rooms, 0, 'r1');
    cleanups.push(() => server.close());

    const adapter = new LocalGrabAdapter({ url: `ws://127.0.0.1:${grabPort}`, roomId: 'r1' });
    adapter.onEvent((e) => rooms.ingest(e));
    await adapter.connect();
    cleanups.push(() => adapter.close());

    const frames: Frame[] = [];
    const client = new WebSocket(`ws://127.0.0.1:${server.port}/?room=r1`);
    client.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'frame') frames.push(m);
    });
    cleanups.push(() => client.terminate());
    await waitFor(() => grab.clients.size === 1 && frames.length > 0);

    const [tool] = [...grab.clients];
    const sentAt = Date.now();
    tool!.send(JSON.stringify({ method: 'WebcastChatMessage', payload: { common: { msgId: 'c1' }, user: { id: 1, nickName: '小鱼' }, content: '锦鲤' } }));
    tool!.send(JSON.stringify({ method: 'WebcastGiftMessage', payload: { common: { msgId: 'g1' }, user: { id: 1, nickName: '小鱼' }, gift: { id: 3, diamondCount: 99 } } }));

    await waitFor(() => frames.some((f) => f.effects.some((e) => e.kind === 'gift')));
    const elapsed = Date.now() - sentAt;
    const all = frames.flatMap((f) => f.effects);
    expect(elapsed).toBeLessThan(3000);
    expect(all.find((e) => e.kind === 'comment')).toMatchObject({ nick: '小鱼', text: '锦鲤' });
    expect(all.find((e) => e.kind === 'gift')).toMatchObject({ tier: 3, label: '挡一次', side: 'A' });
    expect(JSON.stringify(frames)).not.toMatch(/diamond|fen\b|valueFen/i);
  });
});
