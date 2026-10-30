# Spec Delta: client-presentation

## Purpose

玩法客户端呈现层：Cocos Creator（TS）渲染对局状态与事件反馈。本变更交付 demo 最小版——既是 V0 验证轨的推流画面，也是软著说明书截图来源；布局档案机制为多平台移植打基础。

## ADDED Requirements

### Requirement: 对局状态渲染

客户端 SHALL 实时渲染 game-core 下发的对局状态：双方进度条、阵营构成、单位占位表现、阶段倒计时。本变更允许占位美术（色块/几何形），但状态 MUST 与服务端快照一致。

#### Scenario: 状态同步
- **WHEN** 服务端推送新的对局快照（进度/阶段变化）
- **THEN** 客户端画面在 1s 内反映该状态

### Requirement: 事件即时反馈

客户端 SHALL 对每条用户事件给出可感知反馈（弹幕入场、点赞充能、礼物效果演出），从事件发生到画面反馈 MUST ≤3s。demo 版允许简化演出（文字层+基础动效），演出分级体系属后续变更。

#### Scenario: 礼物反馈时延
- **WHEN** 一条礼物 LiveEvent 到达客户端
- **THEN** 3s 内画面出现对应反馈（占位演出即可）且展示送礼者昵称（经词表过滤后形态）

### Requirement: 布局档案机制

客户端 MUST 通过布局档案（Layout Profile）数据驱动 UI 布局——画布尺寸、安全区、UI 控件位置全部来自配置档案；切换平台档案 MUST NOT 修改客户端代码。

#### Scenario: 平台档案切换
- **WHEN** 加载不同的布局档案配置（如抖音 375×812 基准档案）
- **THEN** UI 控件按档案定义重新排布，无代码改动

### Requirement: 演示可跑通

demo 客户端 MUST 能在无真实直播间数据时以模拟事件流完整演示一局（蓄势→攻防→鸿运→结算）——这是 V0 验证前联调与软著截图的前提。

#### Scenario: 模拟演示模式
- **WHEN** 以 demo 模式启动客户端（注入模拟 LiveEvent 流）
- **THEN** 完整呈现一局三阶段并正常结算

### Requirement: 渲染性能基线

客户端 MUST 满足性能基线：渲染 ≥30fps、内存 ≤350MB——demo 阶段以本基线为设计约束，正式压测属阶段 3 测试变更。

#### Scenario: demo 性能抽测
- **WHEN** demo 模式运行 30 分钟
- **THEN** 帧率不低于 30fps，内存无持续增长趋势

### Requirement: 外显文案过词表

客户端一切对外可见文字（demo 占位文字含内）MUST 通过词表系统过滤——禁用词（抽奖/盲盒/礼盒/游戏/玩家/血条/赛季/BUFF 等）不得出现在画面。

#### Scenario: 文案词表门禁
- **WHEN** CI 词表扫描客户端资源与代码内文案
- **THEN** 命中禁用词即提交失败并指出位置
