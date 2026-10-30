/**
 * 本地等价 CI：lint → typecheck → test → scan → sync-check，结果写入 artifacts/verification/。
 * 任一门禁失败则整体失败（但所有门禁都会跑完，便于一次看全）。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'artifacts/verification');
mkdirSync(OUT, { recursive: true });

interface Gate {
  name: string;
  cmd: string[];
}

const gates: Gate[] = [
  { name: 'lint', cmd: ['npx', 'eslint', '.'] },
  { name: 'typecheck', cmd: ['npx', 'tsc', '-p', 'tsconfig.json', '--noEmit'] },
  { name: 'typecheck-view', cmd: ['npx', 'tsc', '-p', 'tsconfig.view.json'] },
  { name: 'test', cmd: ['npx', 'vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile=${OUT}/test-report.json`] },
  { name: 'scan', cmd: ['npx', 'tsx', 'tools/scan-wordlist.ts', `--json=${OUT}/scan-result.json`] },
  { name: 'sync-check', cmd: ['npx', 'tsx', 'tools/sync-client.ts', '--check', `--json=${OUT}/sync-check.json`] },
];

const results: { name: string; ok: boolean; ms: number }[] = [];
for (const g of gates) {
  const t0 = Date.now();
  console.log(`\n── ${g.name} ──`);
  const r = spawnSync(g.cmd[0]!, g.cmd.slice(1), { cwd: ROOT, stdio: 'inherit' });
  results.push({ name: g.name, ok: r.status === 0, ms: Date.now() - t0 });
}

const ok = results.every((r) => r.ok);
writeFileSync(
  resolve(OUT, 'manifest.json'),
  JSON.stringify({ ok, finishedAt: new Date().toISOString(), node: process.version, gates: results }, null, 2),
);
console.log(`\nCI ${ok ? 'PASSED' : 'FAILED'}: ${results.map((r) => `${r.name}=${r.ok ? 'ok' : 'FAIL'}`).join(' ')}`);
process.exit(ok ? 0 : 1);
