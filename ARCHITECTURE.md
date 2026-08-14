# ARCHITECTURE · 项目架构

> 给开发者与 Agent：理解「数据存在哪、谁在算、状态怎么流」。

## 总览

pnpm monorepo，三个包 + 顶层脚本/文档：

```
小鳄龙之家（Web 游戏大厅）
├─ packages/rules    纯 TS 规则引擎（零依赖，可独立测试/迁移）
├─ apps/web          React 前端（大厅 + 出包魔法师 UI）
├─ apps/server       Node 服务端（Socket.IO 房间 + 静态托管）
├─ scripts/          打包/部署/截图/回归脚本
└─ docs/             架构/部署/安全/方向文档
```

## 部署形态（数据存储方式）

- **无数据库**：对局即开即散。服务端只持有内存态：`rooms: Map<roomCode, Room>`。
- **权威状态**：联机对局的状态只存在于服务端 Room 内的 `Game` 引擎实例；
  客户端拿到的是 `getView(playerId)` 的**投影视图**，不是全量状态。
- **客户端持久化**：仅浏览器 localStorage 两类键——
  - `tm-settings`：昵称/音效/动画/战报/AI 节奏/服务器地址（个人偏好）
  - `tm-room-tokens`：按房间码存储 `{playerId, name, ts}`（断线重连凭据）
- **前端产物**：`apps/web/dist` 纯静态文件，由服务端同端口托管 → 无独立客户端包。

## 数据流

### 本地单人（浏览器内闭环）

```
GameTable UI ──动作──> useLocalGame(useRef<Game>) ──> packages/rules Game 引擎
     ▲                                                    │
     └──────────── getView('you') 投影视图（setState）◄────┘
AI 回合：useEffect 检测 current.isBot → 延时 chooseAiAction(该玩家视角) → 引擎动作
```

### 联机（权威服务端）

```
浏览器 A/B（GameTable）
   │ declareSpell/endTurn/nextRound（socket.emit）
   ▼
apps/server  Socket.IO
   ├─ listRooms / createRoom / joinRoom(密码校验) / setPassword …
   └─ Room：座位管理、托管策略、房主转移、空房回收
        │
        ▼
   packages/rules Game（每房间一个实例）
        │
        ▼
   broadcastViews()：对每个在线真人 emit 各自 getView(playerId) 的 state
断线：Room 按托管策略延时后以 AI 代打（chooseAiAction 只吃视角，真人回来即接管）
```

### 关键信息模型（规则引擎核心）

- 每个玩家**看不到自己的手牌**、能看到所有他人手牌；弃牌堆公开；牌堆/秘密牌堆只有数量公开；
  自己获得的秘密牌对自己可见，他人秘密牌仅知数量。
- `getView(playerId)` 是这一切的唯一出口；轮末/终局向本人揭晓自己的手牌（复盘）。
- `magicRemaining[magic]`：该玩家视角下每个魔法的剩余张数 = 总张数 − 可见明牌（他人手牌+弃牌+自己秘密牌），因人而异。

## 各包文件与接口说明

### packages/rules

| 文件 | 内容 |
|------|------|
| `types.ts` | 规则常量（36 张牌/8 魔法/HP/8 分制）与全部共享类型（PlayerView/SeatView/RoundResult…） |
| `engine.ts` | `Game` 类：`declareSpell/endTurn/nextRound/getView/startRound`；轮末结算（击杀/全施法/自杀）、猫头鹰加分、胜负判定 |
| `ai.ts` | `chooseAiAction(view, opts)`：超几何推理手牌概率 → 期望收益决策；**只用玩家视角信息** |
| `rng.ts` | `mulberry32`（可复现随机）、`rollD3`、`shuffle` |
| `protocol.ts` | Socket.IO 双向事件类型（ClientToServer/ServerToClient）、房间设置、房间列表项、`GAME_ID` |

对外接口：`getView(playerId)`（投影）、`declareSpell(playerId, magic)`、`endTurn(playerId)`、
`nextRound()`、`chooseAiAction(view)`。所有动作返回 `{ok} | {ok:false, error}`，联机非法输入必须安全拒绝（v8 安全加固）。

### apps/server

| 文件 | 内容 |
|------|------|
| `index.ts` | 入口：express + http + Socket.IO；限流（每 IP 连接/建房、全局房间上限）；CORS 默认同源；静态托管 web/dist + SPA 回退；`/healthz` |
| `room.ts` | `Room` 类：座位/密码/设置（托管策略、AI 节奏）/房主转移/空房回收/托管调度；`listItem()` 供房间列表 |
| `scripts/smoke.mjs` | 端到端冒烟（含密码、恶意 payload、关房用例） |

### apps/web

| 文件 | 内容 |
|------|------|
| `App.tsx` | 页面状态机：首页(小鳄龙之家) → Hall → GameDetail → Local/Online |
| `HallScreen.tsx` / `GameDetailScreen.tsx` | 大厅游戏列表 / 出包魔法师详情（单人设置+联机入口+偏好） |
| `LobbyScreen.tsx` | 房间列表 / 创建加入 / 密码 / 房主设置 |
| `GameTable.tsx` | 对局 UI（本地/联机共用）：座位、魔法栏（剩 N 徽标）、全屏特效、轮末复盘侧栏、日志 |
| `useLocalGame.ts` / `useRemoteGame.ts` | 本地引擎驱动 / Socket.IO 远程驱动，统一为 `GameApi` |
| `components.tsx` / `fx.ts` / `GameSettings.ts` | 卡牌/血条组件、合成音效、设置类型与预设 |
| `GameSettings.ts` | `GameSettings` 类型、AI 节奏预设、默认值（localStorage 持久化） |

## 约束与约定（改动前必读）

1. **信息模型不可破坏**：任何新状态字段都要过 `getView` 投影，禁止把全量状态直接下发。
2. **引擎保持零依赖、可注入随机**：便于单测与未来迁移（如 boardgame.io）。
3. **协议改动 = 双端一起改**：`protocol.ts` 是唯一事件契约；服务端对所有入参做白名单/数值校验。
4. **本地/联机 UI 共用**：新界面逻辑放 `GameTable`/组件，行为差异通过 `GameApi` 适配。
5. 提交规范与开发流程见 [AGENTS.md](AGENTS.md)。
