# Spec Delta: live-event-pipeline

## Purpose

直播互动事件接入管道：把任意来源（民间抓取流/官方平台推送）的直播间互动数据归一化为统一的 LiveEvent 流，供 game-core 消费。它是 Core/Adapter 分离架构中 Adapter 侧的行为契约。

## ADDED Requirements

### Requirement: 统一事件模型

系统 SHALL 将所有来源的直播间互动数据归一化为统一事件模型 LiveEvent，事件类型 MUST 覆盖：comment（弹幕）、like（点赞）、gift（礼物）、follow（关注）、join（进场）。每类事件 MUST 携带：用户标识、昵称、事件时间戳、来源幂等键。

#### Scenario: 抓取流弹幕归一化
- **WHEN** 本地抓取工具推送一条弹幕原始消息（含昵称/内容/用户标识）
- **THEN** 管道输出一条 comment 类型 LiveEvent，字段完整且类型与接口定义一致

#### Scenario: 未知消息类型容错
- **WHEN** 来源推送了事件模型未覆盖的消息类型
- **THEN** 管道 MUST 不崩溃、不中断后续消息处理，并记录该消息供排查

### Requirement: 幂等去重

系统 SHALL 对每条事件按来源幂等键去重——相同幂等键的重复事件 MUST 只向下游投递一次。

#### Scenario: 同一礼物消息重复推送
- **WHEN** 来源因重连或补推重发了同一幂等键的礼物事件
- **THEN** game-core 只收到一次该事件，助力值只结算一次

### Requirement: 礼物价值归一化

系统 SHALL 将礼物价值统一换算为以"分"（RMB cents）为单位的数值，换算表 MUST 由服务端配置驱动、可热更新，不硬编码任何平台礼物 ID。连击礼物（来源重复推送累计数量）MUST 按增量拆分，保证同一连击不被重复结算。金额字段 MUST 止于管道：管道输出的 gift 事件只携带档位与指定随机款标记，`valueFen` 仅供管道内部与审计日志使用，game-core 不得输出。

#### Scenario: 新平台礼物目录接入
- **WHEN** 配置中新增某平台的礼物 ID 到分的换算条目并热更新
- **THEN** 该平台礼物事件立即按新换算表输出价值，无需发版

### Requirement: 平台适配器可插拔

系统 MUST 提供 PlatformAdapter 统一接口；game-core MUST NOT 直接依赖任何具体平台 SDK 或数据格式。新增一个平台适配器 MUST NOT 修改 game-core 的任何代码。

#### Scenario: 适配器替换运行
- **WHEN** 将运行中的 local-grab-adapter 替换为官方 douyin-adapter（同一 game-core）
- **THEN** game-core 无需代码变更即可继续运行，仅配置切换

### Requirement: 用户信息内容过滤

系统 SHALL 在事件进入下游前，对用户昵称执行词表过滤——命中禁用词的昵称 MUST 以打码形式输出（如"锦鲤\*\*"）。词表 MUST 服务端配置化。

#### Scenario: 违规昵称上屏前置拦截
- **WHEN** 一条事件的用户昵称命中禁用词
- **THEN** 输出给客户端展示层的昵称为打码形态，原始昵称不出现在任何展示路径

### Requirement: 事件吞吐性能红线

管道 MUST 满足最严超集压测基线（快手官方指标）：单房间聚合 1000 QPS、全局 4200 QPS、推送 P995 < 1s；在此压力下事件丢失率 MUST 为 0（去重除外）。本变更以任务 3.6 进程内压测承接单房间指标；全局 4200 QPS 与真实网络压测后置至 compliance-testkit 变更。

#### Scenario: 单房间高压弹幕
- **WHEN** 单房间弹幕+点赞+礼物混合流量达到聚合 1000 QPS
- **THEN** 管道持续正常投递，无崩溃、无积压超限，P995 延迟 < 1s
