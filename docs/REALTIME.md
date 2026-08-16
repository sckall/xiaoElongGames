# 平台 Realtime（FPS/动作类）通道设计与实施记录

> 依据 `docs/ARCHITECTURE.md` 的 realtime 接入路线，为《鳄龙咆哮》（games/corcodragon-fight）
> 落地的实时联机方案说明。本文是平台改造的“唯一决策文档”。

## 1. 目标

在不动出包魔法师（turn-based）大厅/房间/连接逻辑的前提下，新增一条平行 realtime
通道，支持 **服务端权威可配置频率 tick（20/30/60Hz，默认 30Hz）+ 客户端输入流 + 按玩家视角快照**。

## 2. 契约扩展（games/types.ts）

- 新增 `RealtimeGameEngine`：`tick(dtMs)` / `applyInput(playerId, input)` /
  `getSnapshot(playerId)`；输入校验语义与 `GameEngine.apply` 相同（非法必须安全拒绝）。
- `GameModule` 新增可选 `createRealtimeEngine(players, options?, rng?)`；
  `mode: 'realtime'` 的游戏实现它，turn-based 游戏不受影响。

## 3. 网络协议（在 @tm/rules protocol.ts 上做加法，不删除旧事件）

| 方向 | 事件 | 载荷 | 频率 |
|------|------|------|------|
| C→S | `rtInput` | `{ input: unknown }`（引擎白名单校验） | 事件驱动（键鼠边沿 + 移动/视角变化），可靠有序 |
| S→C | `rtSnapshot` | `getSnapshot(playerId)` 投影快照 | 每房间按房主选择 20/30/60Hz（默认 30Hz）；arena 只发一次、他人私有统计字段省略；**`volatile` 广播**（慢连接积压时丢旧快照，不排队旧状态） |
| 双向 | 既有 `lobby/state/error` | `lobby` 增加 `gameId` 字段 | 复用大厅生命周期 |

房间码全局唯一（跨游戏共用 `rooms` Map），`createRoom` 载荷增加可选 `gameId`
与游戏自定 `config`；服务端按 `gameId` 路由到 turn-based `Room` 或 realtime
`RealtimeRoom`，互不混用。

## 4. 服务端权威模型

- 每个进行中的 realtime 房间一个 `CorcodragonFightEngine` 实例 + 按引擎 `tickStepMs` 的 `setInterval`；
- `tick` 内部按该房间步长（20Hz=50ms / 30Hz≈33.33ms / 60Hz≈16.67ms）推进，累计上限 250ms，防止事件循环卡顿后追帧雪崩；
- 射击/技能/伤害/重生/胜负全部在引擎内结算：射线-掩体、射线-胶囊、爆头判定、
  距离衰减、冷却与充能；
- 每 tick 后对每个在线真人 `emit('rtSnapshot', engine.getSnapshot(id))`，
  bot 决策也走 `getSnapshot(botId)`（只用视角信息），不享受全知特权。

## 5. 客户端策略

- **输入**：键鼠边沿事件（move/look/jump/fire/ads/reload/switchWeapon/skill/ult）即时发送，
  每条带单调 `seq`；
- **本人渲染**：轻量客户端预测——本地按输入推进视觉位置，同时向最近服务端快照软校正
  （指数收敛）；快照回带 `lastInputSeq` 用于丢弃已确认输入，漂移超过
  `client.softCorrectionThreshold` 时硬吸附服务端位置。默认阈值 1.5m，
  必须大于“全速移动时预测领先的稳态漂移（≈速度/校正速率）”，否则会
  每几个 tick 周期性硬回滚造成移动卡顿；
- **网络观测**：客户端 2s 一次 `rtPing` 估算单程延迟，`?debug=1` 显示
  ping / 漂移 / 待确认输入数 / 渲染 fps；
- **他人渲染**：每个快照到达即写入按服务端时间戳排序的样本缓冲（最多 32 个），
  渲染时间 = 客户端当前时间 − 网络时钟偏移（EMA）− `client.interpolationBufferMs`
  （默认 90ms），在 straddle 渲染时间的两个样本间线性插值位置与朝向
  （Gaffer On Games "Snapshot Interpolation"）。不做墙钟速度外推：
  网络抖动只影响缓冲深度，不产生跳变；样本落后时钳制到最新位置；
- **HUD 渲染节流**：高频 `rtSnapshot` 不再每次 `setState`——最新快照存 ref 供渲染循环
  每帧读取，React 状态按 ~20Hz 节流刷新 HUD；带 `events` 或阶段切换的快照立即渲染，
  保证击杀/命中反馈及时；
- **投影**：隐身敌人快照中 `visible=false` 且位置置空，客户端直接不渲染；
  私有伤害事件只发给双方；弹道/击杀等公开事件按可见性过滤。

## 6. 已知取舍与演进

1. 当前为**全量快照**，已做三项带宽优化：竞技场布局每玩家只发一次、他人私有统计
   字段 JSON 省略、**`volatile` 丢弃积压旧快照**；30Hz 下 2-7 人局域网/普通公网足够，
   更大规模再升级 `getDelta(lastSeq)` 差量快照（契约已预留 `seq` 字段）。
   注意：`volatile` 只在传输层积压时丢弃**整份状态快照**，下一次快照即恢复最新状态，
   不适用需要严格可靠送达的业务事件。
2. 当前断线语义：realtime 房间断线即由引擎 bot 接管（AI 只用该座位视角），
   重连恢复真人输入；如需“站桩/移除”语义只需在 RealtimeRoom 关掉 AI 接管开关。
3. 正式期评估 Colyseus：房间管理/大厅仍用现有平台，Colyseus 只挂 FPS 房间做
   状态补丁/插值/重连；切换点集中在 `apps/server/src/realtime-room.ts`，
   `RealtimeGameEngine` 契约不变。
4. 不采用 WebRTC P2P（作弊面大、主机掉线迁移复杂，见 docs/ARCHITECTURE.md）。

## 7. 实施状态（2026-08-15 已落地）

- [x] 契约：`games/types.ts` `RealtimeGameEngine` + `createRealtimeEngine`
- [x] 协议：`rtInput` / `rtSnapshot` / `createRoom.gameId+config`（旧事件全保留）
- [x] 服务端：`apps/server/src/realtime-room.ts`（可配置 tick、视角快照、断线 AI 接管/重连）
- [x] 引擎：移动/碰撞/弹道/爆头/技能/效果/重生/胜负，全动作白名单校验（34 单测）
- [x] 数据化：gameplay.json + balance.ts 校验/热更新；`?debug=1` tweakpane 调参面板
- [x] 同步调试：输入 seq/回执、rtPing、漂移统计与软校正
- [x] 联机卡顿修复：服务端时间戳插值缓冲（`games/corcodragon-fight/interp.ts`，单测覆盖）、
  volatile 快照、HUD 节流 + 快照 ref、软校正阈值 1.5m
- [x] 客户端：Three.js 第一人称（本地 60fps tick / 联机软校正），HUD/选英雄/计分板
- [x] 验证：`apps/server/scripts/smoke-realtime.mjs`、`scripts/e2e-twowindow-corcodragon.mjs`、
  `scripts/qa-layout-corcodragon-fight.mjs`、截图留档 `docs-dev/screenshots/corcodragon-fight/`
- [ ] 待演进：差量快照（公网高并发）、TDM 房内英雄锁定细化、Colyseus 正式期评估
- [ ] 已知限制：全量快照 2-7 人局域网足够；断线当前语义为 AI 接管（非站桩/移除）
