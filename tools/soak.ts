/**
 * 无头长稳抽测（任务 5.5 的代理指标）：客户端逻辑层（DemoSource + ViewModel）以 60fps 虚拟节拍
 * 连续运行 30 分钟（虚拟时间，加速执行），统计每帧耗时（最大/P99）与堆内存增长。
 * 不含渲染开销——真实帧率/内存仍需人在编辑器/exe 中抽验（任务 5.5）。
 *
 *   npm run soak -- --minutes=30 --json=artifacts/verification/soak.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// client/ 的 package.json 为 Cocos 工程（CommonJS），这里用动态导入兼容命名导出的互操作
const interop = <T>(m: { default?: T } & T): T => (m.default && typeof m.default === 'object' ? m.default : m);
const { DemoSource } = interop(await import('../client/assets/scripts/logic/sources'));
const { ViewModel } = interop(await import('../client/assets/scripts/logic/view-model'));

const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const MINUTES = Number(arg('minutes', '30'));
const OUT = arg('json', '');
const FRAME_MS = 1000 / 60;

const src = new DemoSource({ seed: 42, speed: 1 });
const vm = new ViewModel({ A: '锦鲤', B: '神龟' });
const costs: number[] = [];
const heap: { minute: number; mb: number }[] = [];
let matches = 0;
let lastMatch = 1;

const gc = (globalThis as { gc?: () => void }).gc;
const heapMb = () => {
  gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

const totalFrames = Math.floor((MINUTES * 60 * 1000) / FRAME_MS);
heap.push({ minute: 0, mb: heapMb() });
for (let i = 0; i < totalFrames; i++) {
  const t = i * FRAME_MS;
  const t0 = performance.now();
  const f = src.poll(t);
  if (f) vm.apply(f.snapshot, f.effects);
  costs.push(performance.now() - t0);
  if (src.matchNo !== lastMatch) {
    matches++;
    lastMatch = src.matchNo;
  }
  if (i > 0 && i % (60 * 60 * 5) === 0) heap.push({ minute: Math.round((t / 60000) * 10) / 10, mb: heapMb() });
}
heap.push({ minute: MINUTES, mb: heapMb() });

const sorted = [...costs].sort((a, b) => a - b);
const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
const max = sorted.at(-1)!;
const first = heap[1]?.mb ?? heap[0]!.mb;
const growth = heap.at(-1)!.mb - first;
const report = {
  virtualMinutes: MINUTES,
  frames: totalFrames,
  matchesCompleted: matches,
  frameCostMs: { p99: Math.round(p99 * 1000) / 1000, max: Math.round(max * 1000) / 1000, budget: 33.3 },
  heapMb: heap.map((h) => ({ ...h, mb: Math.round(h.mb * 10) / 10 })),
  heapGrowthAfterWarmupMb: Math.round(growth * 10) / 10,
  gcExposed: Boolean(gc),
  ok: max < 33.3 && growth < 20 && matches >= 1,
};
console.log(JSON.stringify(report, null, 2));
if (OUT) {
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(resolve(OUT), JSON.stringify(report, null, 2));
}
process.exit(report.ok ? 0 : 1);
