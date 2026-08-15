# 《鳄龙咆哮》手感调参与调试指南

> 面向：想不写 TS 就调游戏手感的人（策划/开发者）。
> 调参三件套：`gameplay.json`（数值唯一事实源）→ `?debug=1` tweakpane 面板（实时试调）→
> 导出 JSON 回写仓库（固化为正式配置）。

## 1. 30 秒上手

```bash
pnpm dev                                  # 前端 5173 + 服务端 8787
# 浏览器打开（注意末尾 ?debug=1）：
open 'http://127.0.0.1:5173/?debug=1'
```

进入大厅 → 鳄龙咆哮 → 详情页把「AI 行为」选为 **🧪 移动测试 AI（只走位不攻击）** →
开始本地对局。进入 3D 场景后，右侧会出现「🐊 手感调参（本地）」面板：

- 拖动滑杆 → **下一帧立即生效**（移速/重力/武器伤害/散布/技能数值……）；
- 面板顶部按钮：
  - `⬇️ 导出 gameplay.tuned.json`：下载当前全部数值；
  - `♻️ 恢复出厂配置`：回到 `gameplay.json` 的原始值（同时重建面板）。

试出满意手感后，用导出的 JSON 覆盖
`games/corcodragon-fight/gameplay.json`，跑一遍
`pnpm --filter @tm/game-corcodragon-fight test && pnpm -r typecheck && pnpm --filter @tm/web build`
后提交。**服务端联机以该文件为准，重启服务端后新数值全局生效。**

## 2. gameplay.json 字段速查

文件位置：`games/corcodragon-fight/gameplay.json`。加载/校验/热更新入口：
`games/corcodragon-fight/balance.ts`。

| 分组 | 关键字段 | 单位/说明 | 热更新 |
|------|----------|-----------|--------|
| `tick` | `stepMs` / `maxAccumulatedMs` / `botThinkMs` / `effectChunkMs` | 服务端步长/追帧上限/bot 决策周期/持续伤害结算粒度（毫秒） | ✅ |
| `arena` | `half` / `wallHeight` / `playerRadius` / `eyeY` / `chestY` / `capsuleTopY` / `headshotMinY` / `pitchClamp` | 场地与命中盒（米） | ⚠️ 部分生效（掩体/渲染为模块加载快照，建议改后刷新页面） |
| `movement` | `gravity` / `jumpVelocity` / `adsSpeedMult` | 重力(m/s²)/跳跃初速/开镜移速倍率 | ✅ |
| `combat` | `ultChargeMax` / `ultPerDamage` / `ultPerKill` / `ultPerSecond` / `respawnMs` / `explosionFalloff` / 默认局参数 | 充能与重生 | ✅ |
| `heroes.*` | `hp` / `speed` / `skillCd` / `ability.*` | 英雄基础 + 各技能参数（如 `dashDistance`、`shieldValue`、`markDamage`） | ✅ |
| `weapons.*` | `damage` / `interval` / `spread` / `adsSpread` / `headshot` / `reloadMs` / `falloffStart/End` / `minDmgMult` / `range` | 武器手感 | ✅ |
| `ai` | `preferredRange` / `meleeRange` / `aimTolerance` / `meleeAimTolerance` | bot 战斗风格 | ✅ |
| `client` | `mouseSensitivity` / `interpolationRate` / `correctionRate` / `softCorrectionThreshold` / `maxDeltaMs` | 灵敏度、他人插值、服务端校正、预测回滚阈值 | ✅ |

约定：

- `weapons.*.magSize` / `reserve` 填 `-1` 表示**无限**（代码内转换为 `Infinity`）；
- 所有数值都会被 `validateBalance` 做范围校验；**非法补丁整体拒绝**，绝不让半坏配置进入游戏；
- `defs.ts` 里的 `HERO_DEFS` / `WEAPON_DEFS` 是 Proxy：每次访问实时读 BALANCE，
  所以 HUD 文字、引擎伤害都随滑杆同步变化。

## 3. 推荐的调参流程（配合移动测试 AI）

1. `?debug=1` 开本地局，AI 行为选「移动测试 AI」（它只走位，不干扰你试枪）；
2. 移动手感：`移动` 组 + `客户端手感` 组（鼠标灵敏度/校正速率）；
3. 射击手感：`武器` 组（伤害/射速/散布/爆头/换弹）；
4. 技能节奏：`英雄`（CD）+ `技能与终极技` 组；
5. 每调一段就导出一次 JSON（文件名带日期，如 `gameplay-2026-08-15.json`）；
6. 用 `pnpm --filter @tm/game-corcodragon-fight test` 回归数值相关单测（伤害/技能/充能断言）；
7. 满意后覆盖 `gameplay.json` 并提交，重启服务端。

> 为什么不让线上玩家用面板改数值？本游戏是服务端权威：客户端只发输入。
> 面板只在「本地 vs AI」开启，且 URL 必须带 `?debug=1`；联机房间的数值永远来自
> 服务端加载的 `gameplay.json`，无法被客户端伪造。

## 4. 联机调试（ping / 漂移 / 回执）

- 联机时带 `?debug=1` 打开对局，左上角会显示：
  `🛰 ping 12ms · drift 0.03m · pending 2`。
  - `ping`：客户端每 2 秒发 `rtPing`，按 RTT/2 估算单程延迟；
  - `pending`：已发出、服务端尚未回执的输入数（回执走输入 `seq` + 快照 `lastInputSeq`）；
  - `drift`：本地视觉预测位置与服务端权威位置的偏差（米）。
- 客户端预测模型：本地按输入推进视觉位置 + 每快照指数软校正
  （速率 = `client.correctionRate`）；当 `drift > softCorrectionThreshold` 时
  **立即吸附**服务端位置（硬回滚），避免长期错位。
- 相关事件：`rtInput {input, seq}`、`rtSnapshot(lastInputSeq)`、`rtPing` ack；
  冒烟脚本 `apps/server/scripts/smoke-realtime.mjs` 覆盖 seq 回执与 RTT 探测。

## 5. 常见问题

- **改了 `gameplay.json` 为什么没生效？**
  - 本地页面/面板：刷新页面（面板热更新只针对会话内拖动）；
  - 联机：重启服务端（生产环境冷启动读文件）；`pnpm dev` 用 tsx watch 时一般会自动重启。
- **导出后想恢复？** 面板「恢复出厂配置」，或 `git checkout -- games/corcodragon-fight/gameplay.json`。
- **校验报错？** 错误信息会带字段路径（如 `movement.gravity 必须在 [0, 100] 内`），
  对照第 2 节范围修改即可；单测见 `test/balance.test.ts`。
- **面板不见了？** 确认 URL 带 `?debug=1`，且处于「本地 vs AI」对局（联机只显示网络统计，不给调参面板）。

## 6. 相关文件

| 文件 | 职责 |
|------|------|
| `games/corcodragon-fight/gameplay.json` | 数值源（提交入库，服务端权威） |
| `games/corcodragon-fight/balance.ts` | schema 校验 / 深合并热更新 / 重置 / 导出 |
| `games/corcodragon-fight/defs.ts` | 类型 + Proxy 视图（HERO_DEFS/WEAPON_DEFS） |
| `games/corcodragon-fight/engine.ts` | 所有实时结算读 BALANCE |
| `games/corcodragon-fight/GameUI.tsx` | `?debug=1` 面板与网络统计 |
| `scripts/smoke-tuning.mjs` | 面板冒烟（渲染/控件数/无页面错误） |
| `docs/REALTIME.md` | 联机通道与演进说明 |
