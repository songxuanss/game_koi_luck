# Proposal: tech-foundation

## Why

项目进入执行期（Goal v1.1 阶段 1 + V0 验证轨），仓库尚无一行代码。本次变更是所有后续工作的地基：它必须同时服务三个近期目标——① V0 民间模式验证轨可跑（local-grab 数据链路 + demo 画面）；② 软著申请材料基础（≥3000 行真实代码 + demo 截图，D1 交付件）；③ 官方轨架构定型（Core/Adapter 分离，douyin-adapter 后续零返工接入）。现在做是因为软著加急与双平台提案都在等这份代码基础，它是当前唯一关键路径。

## What Changes

- 新建 monorepo 骨架：`client/`（Cocos Creator 3.8+ TS）、`server/`（Node/TS）、`packages/shared/`（跨端共享类型与配置）；
- 定义 **LiveEvent 统一事件模型**（comment/like/gift/follow/join）与 **PlatformAdapter 接口**——game-core 平台无关原则从第一行代码落地；
- 实现 **local-grab-adapter**：消费本地弹幕抓取工具（`jwwsjlm/douyinLive` 类）的 WebSocket 消息流，归一化为 LiveEvent（含 msgId 幂等去重、礼物价值归一化到"分"）——V0 验证轨数据入口；
- 实现 **game-core 最小版**：房间状态机、三阶段对局循环（蓄势/攻防/鸿运）、助力值经济骨架（档位映射 T0~T7）、进度条胜负判定、阵营自动平衡算法——数值按方案 5.9 v1，全部走服务端配置；
- 实现 **client demo 最小版**：Cocos 竖屏画布渲染对局状态（进度条/阵营/单位占位/事件反馈文字层），布局档案（Layout Profile）机制数据化——同时作为软著说明书截图来源；
- CI 骨架：lint + 单元测试 + **合规词表扫描门禁**（禁用词：抽奖/盲盒/礼盒/游戏/玩家/血条/赛季/BUFF 等，方案 2.3）；
- 软著材料工具：源代码 PDF 自动排版脚本（页眉/页码/每页 50 行，规范见 docs/正规渠道申请指南.md）。

## Capabilities

### New Capabilities

- `live-event-pipeline`: 直播互动事件接入管道——统一事件模型、平台适配器接口、事件归一化（去重/价值归一化/用户信息脱敏过滤）
- `game-core`: 玩法对局核心——房间状态机、阶段循环、助力值经济、胜负判定、阵营平衡，平台无关且数值全配置化
- `client-presentation`: 玩法客户端呈现——对局状态渲染、事件反馈演出、布局档案机制（demo 最小版）
- `repo-infra`: 仓库与工具链——monorepo 结构、CI 质检门禁（含合规词表扫描）、软著材料生成工具

### Modified Capabilities

（无——全新项目，无既有规格）

## Impact

- **代码**：仓库从空到 monorepo 骨架 + 上述四域最小实现；无存量代码，无破坏性变更；
- **依赖**：Node ≥20、TypeScript 5.x、Cocos Creator 3.8+（编辑器版本）、ws（WebSocket 服务端）、vitest（单测）；不引入任何平台官方 SDK（adapter 接口先行，官方 SDK 到官方轨 change 再接）；
- **关联交付件**：D1 软著（代码基础与截图来源）、V0 验证轨（local-grab 链路）、阶段 1 出口（架构评审对象）；
- **合规关联**：词表扫描门禁将方案附录 C 的"反催氪层/平台规则层"部分自动化；本变更不产生任何用户可见外显文案（demo 文字层仅技术占位，上线文案在后续 change 过词表）。

## Guardrails 自检（按 config rules）

| 规则 | 自检结论 |
| --- | --- |
| R1 法律+平台规则 | local-grab-adapter 仅是本地数据接口组件，其使用受 R3b 纪律约束（可弃置账号、≤5 熟人、不中心化收集）；代码层不含任何现金回兑/交易能力，随机产出不可交易原则在本变更无数值实现（随机外观系统属后续 change） |
| R2 反催氪 | 本变更无付费外显文案；demo 占位文字过词表；"助力值"为唯一计量单位，无金额显示（5.8 原则 1 在代码层落地） |
| R3/R3b | game-core 平台无关（Auto-Host 属后续 change）；local-grab-adapter 明确标注"仅限 V0 验证轨，T0 后停用" |
| R4 预算 | 无现金支出（agent 生产）；Cocos 编辑器与工具链免费 |
| 合规三层清单 | 法律层：无现金/实物奖励逻辑 ✓；平台规则层：词表扫描门禁本变更内建 ✓；反催氪层：无催氪文案产生 ✓ |
| 阶段门关联 | **G1**（阶段 1 出口=架构评审通过+demo 链路跑通）；失败关联：若 V0 验证数据悲观 → 7.5 悲观档决策，本架构的复用性保证损失最小 |
