# Design: tech-foundation

## Context

空仓库起步，约束来自 Goal（openspec/config.yaml，v1.2）：技术栈 Cocos Creator 3.8+（TS）+ Node/TS 服务端、Core/Adapter 分离、原生 exe 唯一构建目标、数值全配置化、agent 生产 + L0~L3 验证分级。本变更是阶段 1（技术选型与架构），出口 = 架构评审 + demo 链路跑通。参考 `docs/GOAL-阶段计划.md` 阶段 1 与 `docs/立项调研与总体方案.md` 第 10 章。

> 决策编号用 AD1~AD8（Architecture Decision），避免与 Goal 交付件 D1~D3（软著/入驻/提案）混淆。

## Goals / Non-Goals

**Goals:**
- 一份代码同时服务 V0 验证轨、软著材料、官方轨架构定型（三用合一）；
- Adapter 接口先于官方 SDK 落地——local-grab 先行，douyin-adapter 后续零改 core 接入；
- L0 CI 门禁（含合规词表扫描）第一天可用。

**Non-Goals:**
- 不接任何平台官方 SDK/鉴权（官方轨 change 处理）；
- 不做 Auto-Host（导演/TTS/音景——后续 change）；
- 不做激励锚点 P0（归因反馈仅输出数据字段；集体充能/双层榜演出属后续 change）；
- 不做正式美术与特效分级（demo 占位渲染即可）；
- 不做部署与云资源（本地跑通为准）。

## Decisions

### AD1: monorepo 用 npm workspaces（不引入 pnpm/turborepo/nx）

workspaces = `packages/shared`、`packages/core`、`server`；`client/`（Cocos 工程，自带 package.json 与编辑器生成物）与 `tools/`（tsx 直跑脚本）不入 workspace。
- 改选 npm（原选 pnpm）：开发机未装 pnpm，npm 随 Node 自带，1 人团队少一个工具链环节；规模（3 包）下二者无实质差异。
- workspace 包直接以 TS 源码导出（`exports: ./src/index.ts`），tsx/vitest/esbuild/tsc(Bundler 解析) 均可直接消费，无需预构建。

### AD2: shared 包 = 类型 + 词表 + 配置默认值；core 包 = 纯函数内核

- `@jinli/shared`：LiveEvent/PlatformAdapter 类型、对局配置类型与默认值（方案 5.9 v1 + v0.7 修正）、词表数据与过滤器、模拟事件剧本；**零运行时依赖**（可原样同步进 Cocos）。
- 配置的 zod 运行时校验放在 `@jinli/shared/schema`（仅 server/tools 使用，不同步进客户端），并以编译期断言保证 `z.infer<schema>` 与手写类型一致。
- `@jinli/core`：纯函数对局内核，同样零依赖——客户端 demo 模式直接在本地跑内核（无 server 也能演示一局，AD5）。
- 内部代号不入代码：命名空间统一 `@jinli`（Goal v1.2 规则）。

### AD3: local-grab-adapter 直连 jwwsjlm/douyinLive 的本地 WS 协议

该工具将弹幕/礼物/点赞/进场消息经本地 WebSocket 转发。adapter 作为 WS 客户端接入，按抖音 Webcast 消息语义（`WebcastChatMessage/GiftMessage/LikeMessage/MemberMessage/SocialMessage`）宽松解析（zod passthrough，字段名在 4.3 真机联调时核实）。normalizer 负责：昵称词表打码、价值归一化（礼物配置表优先 → 抖币×10 分兜底 → 未知按 T0）、连击礼物按 `repeatCount` 增量拆分（抖音连击会重复推送累计值）、幂等键去重。重连：指数退避，断线期间事件丢弃可接受（V0 不要求回查）。
- 备选：DouyinBarrageGrab（系统代理抓包形态）——不如纯 WS 客户端干净，弃。
- **R3b 边界**：local-grab 代码位于 `server/src/adapters/local-grab/`，软著源码 PDF 工具默认排除该目录，官方提审包不打入。

### AD4: core 纯函数内核 + 房间管理外壳

- 内核：`step(state, input, config) -> { state, effects[] }` 纯函数。输入 = `LiveEvent | tick | control`，全部携带显式时间戳——单测可穷举、回放可确定性；T4 皮肤随机用事件幂等键做种子的确定性 PRNG（回放一致）。
- 外壳（server）：RoomManager 管理房间生命周期/配置热更新（下局生效或立即生效，配置项）/快照广播（~100ms 节流合并）/驱动 tick。
- 助力值（贡献分）与进度（胜负推进）分离（方案 5.9 ⑧）；计时耗尽进入"终局潮汐"（方案 5.2 v0.7）——胜负条件始终唯一。
- 备选：帧循环模拟被否——弹幕玩法以事件驱动为主；tick 仅用于时间推进与持续性效果结算。

### AD5: 客户端 demo = 快照消费者 + 本地内核演示模式

- 纯逻辑层（`client/assets/scripts/logic/`，无 `cc` 依赖，可在 Node 下单测）：布局档案解析、视图模型（快照+效果 → 渲染模型/反馈队列）、数据源（本地内核 demo 源 / WS 网络源）。
- 视图层（`client/assets/scripts/view/`）：单个 `JinliMain` 组件在运行时用 Graphics/Label 构建全部占位 UI——场景里只需一个挂该组件的 Canvas 节点，避免手写 .scene。
- 布局档案：`client/assets/resources/profiles/<name>.json`，组件属性填档案名，切换零代码改动。
- Cocos 3.8.x，2D 渲染（竖屏画布），不启用 3D 管线；demo 画面统一 DEV 水印。

### AD6: CI 用 GitHub Actions + 本地等价 `npm run ci` + 自研词表扫描器

词表扫描器（~150 行 TS）扫描：TS 源码的字符串/模板字面量、JSON 配置的值、所有文件名；中文词子串匹配、英文词按词边界大小写不敏感匹配。不扫描注释与标识符（内部工程语言，不外显）。测试框架 vitest。

### AD7: 软著材料工具 = Node 脚本 + pdfkit + 系统 CJK 字体

输入：源码目录（有序清单 + 排除清单）+ 软件全称/版本/著作权人（单一配置 `tools/softcopyright.config.json`）；输出：A4 纵向 PDF，页眉=全称+版本、右上角页码、页脚=著作权人、每页 50 行、去空行、前后各 30 页。

### AD8: 验证包

`npm run ci` 产出 `artifacts/verification/`（test-report.json / scan-result.json / sync-check.json / manifest.json），`npm run verify-pack` 汇总为 `VERIFICATION.md`（自测报告 + 合规自查 + 风险声明 + 验证级别建议）。

## Risks / Trade-offs

- [Cocos 对 workspace 依赖的消费] → `tools/sync-client.ts` 把 shared/core 源码单向拷贝进 `client/assets/scripts/generated/` 并改写包导入为相对路径；CI `--check` 校验一致；
- [local-grab 工具协议变更/失效] → adapter 薄隔离 + 宽松 schema；失效只影响 V0；R3b：T0 后停用；
- [纯函数内核的事件时序依赖] → 时间语义显式入参，内核禁 `Date.now()`/`Math.random()`/定时器（lint 规则强制 + 依赖扫描测试）；
- [demo 占位美术被误当成品] → DEV 水印；软著说明书截图如实反映软件形态；
- [5.9 数值 v1 + v0.7 进度上限未经验证] → 全部走配置默认值，内测校准只改配置不改内核；进度上限属 L2 人审批项；
- [Cocos 视图层无法在 CI 编译] → 视图层保持极薄，逻辑全部下沉到可单测的 logic 层；视图层编译由人在编辑器打开工程时验证（任务 5.1，L2）。

## Migration Plan

空仓起步，无迁移。回滚 = 仓库重置（pre-change 无生产系统）。

## Open Questions

- 抓取工具实际消息字段名（4.3 真机联调核实，normalizer 已按宽松解析设计）；
- 平台对"终局潮汐"与进度上限的提案接受度（D3 提案附录说明）。
