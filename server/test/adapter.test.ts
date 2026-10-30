import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import type { AdapterStatus, LiveEvent } from '@jinli/shared';
import { LocalGrabAdapter } from '../src';

const servers: WebSocketServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

function mockGrabServer(port = 0): Promise<WebSocketServer> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port });
    servers.push(wss);
    wss.on('listening', () => resolve(wss));
  });
}

const portOf = (wss: WebSocketServer) => (wss.address() as { port: number }).port;

function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => (cond() ? resolve() : Date.now() - start > ms ? reject(new Error('timeout')) : setTimeout(poll, 10));
    poll();
  });
}

describe('LocalGrabAdapter', () => {
  it('connects, normalizes messages, ignores garbage, and reconnects after the tool restarts', async () => {
    let wss = await mockGrabServer();
    const port = portOf(wss);
    const events: LiveEvent[] = [];
    const statuses: AdapterStatus['state'][] = [];
    const adapter = new LocalGrabAdapter({ url: `ws://127.0.0.1:${port}`, roomId: 'r', backoffInitialMs: 20, backoffMaxMs: 50 });
    adapter.onEvent((e) => events.push(e));
    adapter.onStatus((s) => statuses.push(s.state));
    await adapter.connect();
    await waitFor(() => wss.clients.size === 1);

    const [client] = [...wss.clients];
    client!.send('garbage{');
    client!.send(JSON.stringify({ method: 'WebcastChatMessage', payload: { common: { msgId: '1' }, user: { id: 1, nickName: 'a' }, content: '冲' } }));
    await waitFor(() => events.length === 1);
    expect(adapter.stats.unknown).toBe(1);

    // 抓取工具重启
    for (const c of wss.clients) c.terminate();
    await new Promise((r) => wss.close(r));
    servers.length = 0;
    await waitFor(() => statuses.includes('disconnected'));
    wss = await mockGrabServer(port);
    await waitFor(() => wss.clients.size === 1);
    expect(adapter.stats.reconnects).toBeGreaterThanOrEqual(1);

    await adapter.close();
    expect(statuses.at(-1)).toBe('closed');
  });

  it('keeps the tool connection alive with text ping and tolerates pong replies', async () => {
    const wss = await mockGrabServer();
    const pings: string[] = [];
    wss.on('connection', (c) => c.on('message', (d) => {
      pings.push(d.toString());
      c.send('pong');
    }));
    const adapter = new LocalGrabAdapter({ url: `ws://127.0.0.1:${portOf(wss)}`, roomId: 'r', pingMs: 20 });
    await adapter.connect();
    await waitFor(() => pings.filter((p) => p === 'ping').length >= 2);
    await waitFor(() => adapter.stats.messages >= 2);
    expect(adapter.stats.unknown).toBe(0);
    await adapter.close();
  });
});
