/**
 * 管道压测（任务 3.6）：单房间 1000 QPS 混合流量 × 30s，经 local-grab normalizer → RoomManager → 广播。
 * 统计：投递丢失（去重除外）与"入站→广播"延迟 P995。
 * 进程内压测，不含真实网络；全局 4200 QPS 与网络压测后置至 compliance-testkit。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG } from '../packages/shared/src';
import { LocalGrabNormalizer } from '../server/src/adapters/local-grab/normalizer';
import { DOUYIN_CATALOG } from '../server/src/gift-catalog';
import { RoomManager } from '../server/src/room-manager';

const QPS = Number(process.argv.find((a) => a.startsWith('--qps='))?.slice(6) ?? 1000);
const SECONDS = Number(process.argv.find((a) => a.startsWith('--seconds='))?.slice(10) ?? 30);
const OUT = process.argv.find((a) => a.startsWith('--json='))?.slice(7);

async function main(): Promise<void> {
  const rooms = new RoomManager({ config: DEFAULT_CONFIG });
  rooms.start();
  const normalizer = new LocalGrabNormalizer({ roomId: 'load', catalog: DOUYIN_CATALOG, now: Date.now });

  let sent = 0;
  let duplicates = 0;
  let delivered = 0;
  // 每条事件的"入站→广播"延迟：入站时记录时间戳，下一次广播帧发出时结算（帧携带了这些事件的效果与最新快照）
  let arrivals: number[] = [];
  const latencies: number[] = [];
  rooms.subscribe('load', () => {
    const now = performance.now();
    for (const a of arrivals) latencies.push(now - a);
    arrivals = [];
  });

  const methods = ['WebcastChatMessage', 'WebcastLikeMessage', 'WebcastGiftMessage', 'WebcastMemberMessage'] as const;
  const t0 = performance.now();
  let n = 0;
  const batchMs = 10;
  const perBatch = (QPS * batchMs) / 1000;

  await new Promise<void>((resolveRun) => {
    const timer = setInterval(() => {
      const elapsed = performance.now() - t0;
      if (elapsed >= SECONDS * 1000) {
        clearInterval(timer);
        resolveRun();
        return;
      }
      for (let i = 0; i < perBatch; i++) {
        n++;
        const method = methods[n % 4]!;
        const dup = n % 50 === 0; // 2% 重复推送
        const msgId = dup ? `m${n - 1}` : `m${n}`;
        const payload: Record<string, unknown> = { common: { msgId }, user: { id: n % 500, nickName: `观众${n % 500}` } };
        if (method === 'WebcastChatMessage') payload.content = n % 3 ? '冲' : '锦鲤';
        if (method === 'WebcastLikeMessage') payload.count = 3;
        if (method === 'WebcastGiftMessage') payload.gift = { id: n % 7, diamondCount: [1, 19, 52, 99][n % 4] };
        const arrival = performance.now();
        const events = normalizer.normalize({ method, payload });
        sent++;
        if (dup) duplicates++;
        for (const ev of events) {
          const before = rooms.stats.events;
          rooms.ingest(ev);
          delivered += rooms.stats.events - before;
          arrivals.push(arrival);
        }
      }
    }, batchMs);
  });
  await new Promise((r) => setTimeout(r, 300));
  rooms.stop();

  const expected = sent - duplicates;
  const lost = expected - delivered;
  const framed = latencies.length;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p995 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))]! : 0;
  const report = {
    qps: QPS,
    seconds: SECONDS,
    sent,
    duplicatesInjected: duplicates,
    delivered,
    lost,
    measured: framed,
    p995Ms: Math.round(p995 * 10) / 10,
    ok: lost === 0 && framed >= delivered * 0.95 && p995 < 1000,
  };
  console.log(JSON.stringify(report, null, 2));
  if (OUT) {
    mkdirSync(resolve(OUT, '..'), { recursive: true });
    writeFileSync(resolve(OUT), JSON.stringify(report, null, 2));
  }
  process.exit(report.ok ? 0 : 1);
}

void main();
