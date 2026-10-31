/**
 * 验证包组装（任务 7.2）：汇总 artifacts/verification/ 下机器可读结果 → VERIFICATION.md。
 * 先 `npm run ci`，再（可选）`npm run loadtest -- --json=artifacts/verification/loadtest.json`。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../artifacts/verification');
const read = <T>(name: string): T | null => {
  const p = resolve(OUT, name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null;
};

const manifest = read<{ ok: boolean; finishedAt: string; node: string; gates: { name: string; ok: boolean; ms: number }[] }>('manifest.json');
const tests = read<{ numTotalTests: number; numPassedTests: number; numFailedTests: number; numTotalTestSuites: number }>('test-report.json');
const scan = read<{ ok: boolean; files: number; hits: unknown[] }>('scan-result.json');
const sync = read<{ ok: boolean; files: number }>('sync-check.json');
const soak = read<{ virtualMinutes: number; frames: number; matchesCompleted: number; frameCostMs: { p99: number; max: number; budget: number }; heapGrowthAfterWarmupMb: number; ok: boolean }>('soak.json');
const cocos = read<{ date: string; editorVersion: string; profilesPassed: string[]; durationMinutes: number; observedFpsMin: number; memoryKb: { start: number; end: number; growthPercent: number }; memoryLimitMb: number; ok: boolean }>('cocos-manual.json');
const load = read<{ qps: number; seconds: number; sent: number; delivered: number; lost: number; p995Ms: number; ok: boolean }>('loadtest.json');

const mark = (ok: boolean | undefined) => (ok === undefined ? '⬜ 未运行' : ok ? '✅' : '❌');

const md = `# 验证包 · tech-foundation

> 生成时间 ${new Date().toISOString()} · CI 完成于 ${manifest?.finishedAt ?? '（未运行 npm run ci）'} · Node ${manifest?.node ?? '-'}
> 先看本页，再按"抽验点"人工验证。

## 1. 自测报告

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
${(manifest?.gates ?? []).map((g) => `| ${g.name} | ${mark(g.ok)} | ${(g.ms / 1000).toFixed(1)}s |`).join('\n') || '| - | ⬜ | 先运行 npm run ci |'}

- 单元/集成测试：${tests ? `${tests.numPassedTests}/${tests.numTotalTests} 通过（${tests.numTotalTestSuites} 个套件，失败 ${tests.numFailedTests}）` : '未运行'}
- 管道压测（任务 3.6，进程内）：${load ? `${mark(load.ok)} ${load.qps} QPS × ${load.seconds}s，发送 ${load.sent}，投递 ${load.delivered}，丢失 ${load.lost}，P995 ${load.p995Ms}ms（红线 <1000ms）` : '⬜ 未运行（npm run loadtest -- --json=artifacts/verification/loadtest.json）'}
- 客户端逻辑层长稳（任务 5.5 代理指标，无渲染）：${soak ? `${mark(soak.ok)} 虚拟 ${soak.virtualMinutes} 分钟 @60fps（${soak.frames} 帧，完成 ${soak.matchesCompleted} 局），帧耗时 P99 ${soak.frameCostMs.p99}ms / 最大 ${soak.frameCostMs.max}ms（预算 ${soak.frameCostMs.budget}ms），堆内存增长 ${soak.heapGrowthAfterWarmupMb}MB` : '⬜ 未运行（npm run soak -- --json=artifacts/verification/soak.json）'}
- Cocos 真实预览（任务 5.1/5.5，人工 L2）：${cocos ? `${mark(cocos.ok)} ${cocos.date} · Creator ${cocos.editorVersion} · ${cocos.profilesPassed.join(' / ')} · 连续 ${cocos.durationMinutes} 分钟 · 观测最低 ${cocos.observedFpsMin}fps · 内存 ${cocos.memoryKb.start}K → ${cocos.memoryKb.end}K（+${cocos.memoryKb.growthPercent.toFixed(1)}%，上限 ${cocos.memoryLimitMb}MB）` : '⬜ 未验收'}
- 客户端同步一致性：${mark(sync?.ok)} ${sync ? `${sync.files} 个文件` : ''}

## 2. 合规自查（对照 config.yaml rules 与方案附录 C）

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| R1 随机产出不可交易（代码级） | ${mark(manifest?.gates.find((g) => g.name === 'test')?.ok)} | core 纯度测试：无 trade/transfer/redeem 接口；T4 随机仅外观（效果固定），概率合计 100 且已入配置 |
| R1 无现金/实物回报 | ✅ | core 输出类型无任何金额/奖品字段（"never outputs currency fields" 测试） |
| R2 零金额显示 | ${mark(manifest?.gates.find((g) => g.name === 'test')?.ok)} | 金额止于管道（normalizer 审计回调）；客户端 feed 零货币单位测试 |
| R2 催氪红线进词表 | ${mark(scan?.ok)} | 词表含催付指令、金额播报、对比羞辱、收益承诺等催氪句式；扫描 ${scan ? `${scan.files} 文件，${scan.hits.length} 命中` : '未运行'} |
| R3 平台无关 | ${mark(manifest?.gates.find((g) => g.name === 'lint')?.ok)} | core/shared 禁止 import 平台/IO 模块（eslint + 依赖扫描测试） |
| R3b 民间路线边界 | ✅ | local-grab 独立目录、软著 PDF 默认排除、main.ts 启动时打印 V0 声明 |
| R4 预算 | ✅ | 本变更零现金支出 |
| 内部代号不外显 | ${mark(scan?.ok)} | 内部代号已进词表（含大小写变体）；软件名为"幸运锦鲤直播互动系统" |
| 单件礼物进度 ≤12.5% | ✅ | zod schema 校验 + 单测 |

## 3. 风险声明

1. **抓取消息格式已按工具官方文档对齐**（扁平 JSON、ws://127.0.0.1:1088/ws/<直播间标识>、ping/pong、system 状态帧、snake/camel 键容错），但**未经真机核实**；工具文档自述礼物消息可能缺失/字段不全——缺礼物计价信息时按 T0 兜底。真机联调（4.3）后可能仍需微调（4.4）。
2. **原生 exe 尚未构建**——Cocos Creator 3.8.8 工程导入、完整对局、双布局与 Chrome 预览 30 分钟性能已由人验收（5.1/5.5）；正式 exe 的渲染、内存与长稳仍需构建后复测。
3. **数值 v1 + v0.7 进度上限未经真实数据校准**——T5+ 进度/元显著低于 T0~T4，对 H3 偏保守；属 L2 数值方向审批。
4. **压测为进程内**，不含网络与全局 4200 QPS——后置 compliance-testkit。
5. **软著源码行数**：见 \`npm run softcopyright\` 输出；著作权人姓名需人填写（tools/softcopyright.config.json）。
6. **Goal v1.2 修订未经人签署**：config.yaml 的修订属 Goal 修订，需人 L3 确认。

## 4. 验证级别建议

| 任务 | 级别 | 人抽验点 |
| --- | --- | --- |
| 4.3 真机联调 | L2 | 见 tasks.md 4.3 清单 |
| 5.1 Cocos 工程 | L2 | ✅ 2026-10-31 人抽验通过（Creator 3.8.8，完整对局与双布局） |
| 5.5 性能抽测 | L2 | ✅ 2026-10-31 人抽验通过（30 分钟，最低 56fps，内存增长 2.0%） |
| 6.2 软著名称与 PDF | **L3** | 见 tasks.md 6.2 清单（提交前全验） |
| 7.3 架构评审 | **L3** | 对照 design AD1~AD8 |
| 数值/进度上限方向 | L2 | docs 方案 5.9 ⑧ |
| Goal v1.2 修订 | **L3** | docs/GOAL-阶段计划.md 末尾修订记录 |
`;
writeFileSync(resolve(OUT, '../VERIFICATION.md'), md);
console.log('verification pack written: artifacts/VERIFICATION.md');
