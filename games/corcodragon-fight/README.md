# 《鳄龙咆哮》corcodragon-fight

> 3D 实时英雄射击（FPS）：2-7 人联机，服务端权威 20/30/60Hz tick 模拟（默认 30Hz），
> 5 位鳄龙英雄 × 4 种武器，自由混战 / 团队死斗。

本包按 `games/<id>/` 接入小鳄龙之家大厅，遵守 `docs/ARCHITECTURE.md` 的
**realtime（FPS/动作）接入路线**与 `games/types.ts` 契约。

## 新框架引入说明（必读）

本项目原技术栈为 React + Socket.IO + 零依赖 TS 规则引擎，仅支撑回合制桌游。
《鳄龙咆哮》是 FPS 3D 联机游戏，**新增引入以下依赖**，仅用于游戏包与平台侧
渲染/同步，不影响出包魔法师：

| 依赖 | 用途 | 引入位置 |
|------|------|----------|
| `three` / `@types/three` | 浏览器 3D 场景渲染（第一人称、英雄胶囊、特效） | 仅 `games/corcodragon-fight` |
| `tweakpane` | `?debug=1` 手感调试面板（按需动态加载，不进线上主包） | 仅 `games/corcodragon-fight` |
| Kenney Blaster Kit（CC0） | 掩体木箱 GLB 模型（`assets/models/`，含 License.txt） | 仅客户端资源 |
| Socket.IO 现有依赖 | 复用平台连接层，新增 `rtInput`/`rtSnapshot`/`rtPing` 事件 | 平台协议层 |

引擎（`engine.ts`/`ai.ts`/`defs.ts`）保持**纯 TS 零依赖、rng 可注入**，
可独立单测；Three.js 只在 `GameUI.tsx`（子路径 `./GameUI`）中使用，服务端
不会被打包 React/Three 代码。

**不引入 Colyseus/WebRTC**：按 `docs/ARCHITECTURE.md` 原型期路线先使用
Socket.IO + 服务端 tick（20Hz）广播快照；正式期如需状态补丁/插值/重连开箱
能力，再评估 Colyseus（见 docs/REALTIME.md 迁移说明）。

## 引擎与动作契约

`CorcodragonFightEngine` 实现 `games/types.ts` 的 `RealtimeGameEngine`：

- `tick(dtMs)`：固定 50ms 步长推进移动/射击/技能/效果/重生/胜负；
- `applyInput(playerId, input)`：**全部动作白名单 + 数值域校验**，非法输入返回
  `{ok:false,error}` 绝不抛异常；
- `getSnapshot(playerId)`：按玩家视角投影，隐身敌人不下发、私有伤害事件只给
  双方、事件增量下发。

引擎选项（`createEngine(players, options)`）：

| 选项 | 默认 | 说明 |
|------|------|------|
| `mode` | `ffa` | `ffa` 自由混战 / `tdm` 团队死斗 |
| `scoreLimit` | 15 | 击杀线（1-200，越界回默认） |
| `matchTimeMs` | 600000 | 时长上限，到时按分数判定 |
| `heroSelectMs` | 30000 | 英雄选择倒计时，到时自动补选 |
| `aiStyle` | `combat` | `combat` 实战 AI；`movement` **移动测试 AI（只走位不攻击）** |

| 输入动作 | 字段 | 校验 |
|----------|------|------|
| `selectHero` | `hero` | `HERO_IDS` 白名单；仅 heroSelect 阶段 |
| `move` | `x,z` | 有限数值并钳制 [-1,1]；仅存活 |
| `look` | `yaw,pitch` | 有限数值；pitch 钳制 ±1.4 rad |
| `jump/fire/ads` | `pressed` | 必须布尔；开火仅存活 |
| `reload` | - | 仅存活；非近战；弹匣未满且有备弹 |
| `switchWeapon` | `weapon` | `WEAPON_IDS` 白名单；仅存活 |
| `skill` | - | 仅存活；诡雷为二段瞄准：再按/右键/`skillCancel` 取消 |
| `skillFire` / `skillCancel` | - | 二段技能确认/取消（未准备时安全拒绝） |
| `ult` | - | 仅存活；充能满即可释放（雷暴云以自身为中心） |
| `ultFire` / `ultCancel` | - | 二段终极技确认/取消（预留协议，当前无英雄使用） |
| `spawn` | - | 仅死亡且重生倒计时结束 |

## 英雄与武器

- 英雄：炎刃（冲刺+火径）、影枭（隐身+标记）、铁壁（方向护盾+堡垒）、
  灵音（扇形治疗+领域）、诡雷（二段投掷炸弹+自中心雷暴云）。
- 武器：步枪/狙击枪/手枪/匕首；命中为服务端射线（掩体遮挡 + 胶囊判定），
  支持爆头、伤害衰减、开镜、换弹与近战锥形判定。
- 角色视觉：KayKit Adventurers（CC0）低多边形英雄模型；**视觉替换不影响碰撞箱**，
  加载失败自动回退程序化胶囊人。

## 技能操控（v0.2 起）

- 诡雷 **Q** 进入投掷准备（不耗冷却），**鼠标左键**向当前视角抛出**可见抛物线**粘性炸弹，
  落地 1.2 秒后爆炸；准备中**右键 / 再按 Q / Esc** 取消。
- 雷暴云 **E** 直接以**自身为中心**展开圆形雷暴（4 秒，8/秒，减速 50%，控制为主）。
- 铁壁 Q 在视角正前方展开能量墙（4.8m×3m，300 生命，6 秒），墙随视角实时旋转，
  从几何上拦截敌方子弹，站在墙后的队友同样被保护。
- 灵音 Q 向视角方向发射 60° 扇形治愈波（自疗 45，14m 内队友 30）。
- 影枭 Q 隐身 6 秒；隐身中命中敌人压至 1 血并**立即充满终极技**，攻击或被命中都会显形；
  死亡标记（E）优先锁定**视野内血量最低**的敌人，击杀会刷新 Q。
- 重生后有 1.5 秒无敌时间（HUD 有金光提示）。
- AI 难度分三级（简单/普通/困难）：影响 bot 决策周期、瞄准容差与开火概率，
  本地详情页与联机房间配置均可选。
- 敌人不显示头顶 ID（关闭敌人 ID 视野）；队友名与训练场靶名保留。

## 手感调参

全部玩法数值在 `gameplay.json`（schema 校验见 `balance.ts`）。本地对局 URL 加
`?debug=1` 打开 tweakpane 面板实时拖动，导出 `gameplay.tuned.json` 回写即可。
完整流程见 [docs/GAMEPLAY-TUNING.md](../../docs/GAMEPLAY-TUNING.md)。

## 开发

```bash
pnpm --filter @tm/game-corcodragon-fight test      # 引擎/配置层单测
pnpm --filter @tm/game-corcodragon-fight typecheck
```

相关文档：`docs/REALTIME.md`（平台 realtime 通道设计）、
`docs/GAMEPLAY-TUNING.md`（手感调参指南）。
