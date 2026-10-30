/**
 * 服务端入口。
 *   npm run dev:server -- --source=sim                         # 模拟剧本（默认）
 *   npm run dev:server -- --source=local-grab --douyin-room=<直播间标识>   # V0 验证轨（R3b），默认连 ws://127.0.0.1:1088/ws/<直播间标识>
 * 可选：--port=7788 --room=demo-room
 */
import { DEFAULT_CONFIG, type PlatformAdapter } from '@jinli/shared';
import { LocalGrabAdapter } from './adapters/local-grab/adapter';
import { SimAdapter } from './adapters/sim-adapter';
import { startBroadcast } from './broadcast';
import { RoomManager } from './room-manager';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function main(): Promise<void> {
  const source = arg('source', 'sim');
  const port = Number(arg('port', '7788'));
  const roomId = arg('room', 'demo-room');

  const rooms = new RoomManager({ config: DEFAULT_CONFIG, idleRoomMs: 10 * 60 * 1000 });
  rooms.start();

  let adapter: PlatformAdapter;
  if (source === 'local-grab') {
    log('source=local-grab（仅限 V0 验证轨：可弃置测试号，T0 后停用）');
    adapter = new LocalGrabAdapter({ url: arg('grab-url', `ws://127.0.0.1:1088/ws/${arg('douyin-room', roomId)}`), roomId, log });
  } else {
    adapter = new SimAdapter({ roomId });
  }
  adapter.onEvent((e) => rooms.ingest(e));
  adapter.onStatus((s) => log(`adapter ${adapter.name}: ${s.state}${s.state === 'disconnected' ? ` retry in ${s.retryInMs}ms` : ''}`));

  const server = await startBroadcast(rooms, port, roomId);
  await adapter.connect();
  log(`broadcast ws://127.0.0.1:${server.port}/?room=${roomId}`);

  const statsTimer = setInterval(() => {
    log(`stats events=${rooms.stats.events} frames=${rooms.stats.frames} clients=${server.clients()} rooms=${rooms.roomIds().length}`);
  }, 30_000);

  const shutdown = async () => {
    clearInterval(statsTimer);
    rooms.stop();
    await adapter.close();
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
