# client（Cocos Creator 3.8.x，2D，竖屏）

当前版：流光国潮视觉 + 原创 SVG/PNG 美术 + 布局档案 + 鱼群游动/冲刺与分级事件演出 + 本地内核演示模式。美术源文件位于 `client/art-source/`，可通过根目录 `npm run art:generate` 重建；界面字体为 Noto Sans CJK（OFL）。

## 打开与运行（人，任务 5.1 抽验）

1. 用 Cocos Creator 3.8.x 打开本目录（首次会生成 `library/` `temp/`，已 gitignore）。
2. 新建场景 → 在 Canvas 节点上挂载 `JinliMain` 组件。
3. 组件属性：`profileName`（默认 `douyin-375x812`，可改 `test-wide`）、`mode`（`demo` 本地演示 / `net` 连 server）、`serverUrl`、`demoSpeed`。
4. 预览：demo 模式无需 server 即可完整演示一局。`demoSpeed=20` 用于快速验收；性能与长稳测试必须改回 `1`。
5. 外部修改脚本后，在资源管理器右键 `assets` 选择刷新，再停止并重新预览；旧预览缓存不能作为新版验收证据。

## UX 验收顺序

1. **三秒理解**：不读长文即可指出红/蓝阵营、当前阶段、进度和免费参与口令。
2. **信息不遮挡**：顶部进度始终可见，信息流与底部规则不重叠，普通事件不遮挡规则。
3. **高光可区分**：礼物、全民充能、克制、逆流、跃龙门与结算有不同视觉反馈。
4. **双布局**：切换 `test-wide` 只改组件属性，不改代码；文字和图形不越界。
5. **真实性能**：`demoSpeed=1` 连续 30 分钟，≥30fps、内存 ≤350MB 且增长 <10%。

## 目录

- `assets/scripts/generated/` 由 `npm run sync-client` 自 `packages/shared`、`packages/core` 同步，**不得手改**（CI `sync-check` 校验）。
- `assets/scripts/logic/` 无 `cc` 依赖的纯逻辑（布局解析、视图模型、数据源），在 Node 下单测。
- `assets/scripts/view/JinliMain.ts` 极薄的 Cocos 视图层，运行时用 Graphics/Label 构建全部占位 UI。
- `assets/resources/profiles/*.json` 布局档案。
