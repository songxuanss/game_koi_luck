# 幸运锦鲤 · luckyDrawerNextGen

零真人主播的礼物驱动互动玩法。目标、阶段计划与方案见 `docs/`，工单见 `openspec/changes/`。

## 快速开始

```bash
npm install
npm run ci                 # lint + typecheck + test + 词表扫描 + 客户端同步校验 → artifacts/verification/
npm run dev:server         # 模拟源，广播 ws://127.0.0.1:7788/?room=demo-room
npm run dev:server -- --source=local-grab --douyin-room=<直播间标识>   # V0 验证轨（R3b：仅可弃置测试号，T0 后停用）
npm run loadtest           # 单房间 1000 QPS × 30s 管道压测
npm run verify-pack        # 汇总 artifacts/VERIFICATION.md
npm run softcopyright      # 软著源码 PDF（先在 tools/softcopyright.config.json 填著作权人）
```

## 结构

| 目录 | 内容 |
| --- | --- |
| `packages/shared` | LiveEvent 类型、对局配置（数值 v1）、词表与过滤、确定性随机、模拟剧本 |
| `packages/core` | 纯函数对局内核（禁实时钟/随机/IO，lint+测试强制） |
| `server` | 适配器（local-grab / sim）、RoomManager、广播网关 |
| `client` | Cocos Creator 3.8 demo（见 `client/README.md`） |
| `tools` | 词表扫描、客户端同步、CI、压测、验证包、软著 PDF |

`client/assets/scripts/generated/` 由 `npm run sync-client` 生成，勿手改。
