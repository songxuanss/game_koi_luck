# Spec Delta: repo-infra

## Purpose

仓库与工具链：monorepo 结构、CI 质检门禁（含合规词表扫描）、软著材料生成工具。它保证 agent 生产模式下每个 change 的产出都被 L0 门禁自动约束。

## ADDED Requirements

### Requirement: monorepo 结构

仓库 SHALL 采用 monorepo 结构：`client/`（Cocos 客户端）、`server/`（Node 服务端）、`packages/shared/`（跨端共享类型/词表/配置 schema）。三端 MUST 共享同一份 LiveEvent 类型定义与配置 schema。

#### Scenario: 类型单源
- **WHEN** server 修改 LiveEvent 类型定义
- **THEN** client 与 shared 在同一提交内可感知类型变化（同仓编译校验），不存在第二份拷贝

### Requirement: CI 质检门禁

每次提交 MUST 通过 CI 门禁：lint、单元测试、合规词表扫描三项全绿方可合入。词表扫描 MUST 覆盖代码内文案、资源文件名与配置中的对外文字，命中禁用词 MUST 使提交失败。

#### Scenario: 禁用词拦截
- **WHEN** 提交中引入包含"抽奖"字样的界面文案
- **THEN** CI 失败，输出命中文件与行号，合入被阻止

#### Scenario: 测试失败拦截
- **WHEN** 任一单元测试失败
- **THEN** CI 失败，合入被阻止

### Requirement: 词表配置化

禁用词表 MUST 配置化（`packages/shared` 内单一数据源），词表更新 MUST 立即生效于 CI 扫描，无需修改扫描器代码。

#### Scenario: 新增禁用词
- **WHEN** 向词表数据文件追加一个新禁用词
- **THEN** 下次 CI 扫描即按扩充后的词表执行

### Requirement: 软著材料生成工具

仓库 SHALL 提供源代码 PDF 排版工具：输入源码目录，输出符合登记规范的 PDF——每页 ≥50 行有效代码、页眉含软件全称+版本号、页脚含著作权人、右上角连续页码、前后各 30 页共 60 页（不足全量）。软件全称、版本号与著作权人 MUST 由单一配置项提供，保证与申请表一致。工具 MUST 支持排除清单，默认排除 V0 专用的 local-grab 适配器与自动生成物（R3b 边界）。

#### Scenario: 材料生成
- **WHEN** 运行材料工具并指定软件全称"幸运锦鲤直播互动系统"与版本 V1.0
- **THEN** 输出 60 页 PDF，每页页眉与页码符合登记规范

### Requirement: 验证包支持

CI SHALL 输出可用于"验证包"的结构化结果（测试报告/词表扫描结果/构建产物清单），供 change 完成时按生产模式规则自动组装。

#### Scenario: 验证包素材生成
- **WHEN** 一次 CI 流水线完成
- **THEN** 产出机器可读的测试与扫描结果文件，可被验证包脚本直接引用
