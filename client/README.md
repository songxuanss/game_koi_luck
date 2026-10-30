# client（Cocos Creator 3.8.x，2D，竖屏）

demo 最小版：占位渲染 + 布局档案 + 本地内核演示模式。

## 打开与运行（人，任务 5.1 抽验）

1. 用 Cocos Creator 3.8.x 打开本目录（首次会生成 `library/` `temp/`，已 gitignore）。
2. 新建场景 → 在 Canvas 节点上挂载 `JinliMain` 组件。
3. 组件属性：`profileName`（默认 `douyin-375x812`，可改 `test-wide`）、`mode`（`demo` 本地演示 / `net` 连 server）、`serverUrl`、`demoSpeed`。
4. 预览：demo 模式无需 server 即可完整演示一局。

## 目录

- `assets/scripts/generated/` 由 `npm run sync-client` 自 `packages/shared`、`packages/core` 同步，**不得手改**（CI `sync-check` 校验）。
- `assets/scripts/logic/` 无 `cc` 依赖的纯逻辑（布局解析、视图模型、数据源），在 Node 下单测。
- `assets/scripts/view/JinliMain.ts` 极薄的 Cocos 视图层，运行时用 Graphics/Label 构建全部占位 UI。
- `assets/resources/profiles/*.json` 布局档案。
