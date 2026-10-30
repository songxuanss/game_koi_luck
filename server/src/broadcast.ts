/**
 * 客户端推送网关：ws://host:port/?room=<roomId>，按房间推送 Frame（JSON）。
 */
import { WebSocketServer, type WebSocket } from 'ws';
import type { RoomManager } from './room-manager';

export interface BroadcastServer {
  port: number;
  clients(): number;
  close(): Promise<void>;
}

export function startBroadcast(rooms: RoomManager, port: number, defaultRoom: string): Promise<BroadcastServer> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port });
    wss.on('connection', (socket: WebSocket, req) => {
      const url = new URL(req.url ?? '/', 'ws://local');
      const roomId = url.searchParams.get('room') ?? defaultRoom;
      socket.send(JSON.stringify({ type: 'hello', roomId }));
      const unsubscribe = rooms.subscribe(roomId, (frame) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
      });
      socket.on('close', unsubscribe);
      socket.on('error', unsubscribe);
    });
    wss.on('listening', () => {
      const addr = wss.address();
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : port,
        clients: () => wss.clients.size,
        close: () =>
          new Promise<void>((done) => {
            for (const c of wss.clients) c.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
