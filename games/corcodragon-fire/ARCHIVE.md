# 《鳄龙战场》开发归档（2026-08-15）

> 状态：**暂停开发，已从游戏大厅隐藏**（`GameModule.available = false`）。
> 代码保留在 `games/corcodragon-fire/`，未来若重启项目，先读本文件。

## 1. 项目名称

- 现名称：**《鳄龙战场》**（曾用名：《鳄龙咆哮》）
- `gameId` 仍为 `corcodragon-fire`（为减少代码/注册表/截图路径迁移风险，本次未改 ID）。
  若未来重启，可再评估是否把 ID/目录名一起迁移为 `corcodragon-battlefield`。

## 2. 开发偏差说明

用户原始预期是**3D 实时英雄射击**（团队死斗/自由混战、20Hz 服务端权威同步、
第一人称控制、阶段一至五的联机与性能验收）。当时任务约束为：
“遵守 `games/types.ts` 的 GameModule 契约，不修改大厅/房间/连接代码”。

现有平台契约只支持 turn-based（`apply + getView`），实时 FPS 需要改造平台层
（tick、差量快照、输入流、房间调度按 mode 分支），与“不修改大厅/房间/连接”
冲突。因此当前实现退而求其次，做成了**回合制英雄战术射击**，但用户认为这已
脱离预期，决定暂停开发。

**教训：后续重启必须先和用户确认产品方向，不要自行降级玩法形态。**

## 3. 当前实现情况

- 位置：`games/corcodragon-fire/`
- 引擎：零依赖、rng 可注入、`getView` 投影、`apply` 全量入参白名单校验
- AI：`chooseAiAction` 只使用玩家视角
- UI：详情页 / 英雄选择 / 9×9 竞技场对局（本地 vs AI）
- 内容：5 英雄（炎刃/影枭/铁壁/灵音/诡雷）× 4 武器（步枪/狙击枪/手枪/匕首）
- 玩法：移动→切枪→射击/技能/终极技→结束回合；击杀+1、助攻+0.5；先到 5 杀获胜；
  死亡后在本人回合开始自动复活
- 模式：FFA 已接通 UI；TDM 已在引擎实现但 UI 未开放
- 联机：**未接入**（服务端仍只认出包魔法师动作协议）

## 4. 质量与验收记录

- 单测：`games/corcodragon-fire/test/engine.test.ts`（20 个，含 AI 全自动对局模糊测试）
- 全量：`pnpm -r typecheck` / `pnpm -r test` / `pnpm --filter @tm/web build` 均通过
- 出包魔法师联机冒烟未回归：`apps/server/scripts/smoke.mjs` 通过
- UI 冒烟：能自动打到结算页
- 布局 QA：桌面/平板/手机三档无横向溢出
- 截图：`docs/screenshots/corcodragon-fire/`（8 张，已提交归档）

## 5. 已知限制

1. 无 3D、无第一人称控制、无实时网络同步（这是偏离预期的核心点）。
2. 仅本地 vs AI；联机入口未开放。
3. 无音效；特效仅基础 CSS/emoji。
4. TDM 引擎已支持，但详情页无模式选择，当前只创建 FFA。
5. `gameId` 与目录名仍是 `corcodragon-fire`，不是“战场”的英文直译。

## 6. 重启检查清单

- [ ] 先与用户确认方向：**继续回合制**，还是**升级平台做原版实时 FPS**。
- [ ] 若继续回合制：
  - [ ] 把 `index.ts` 中 `available` 改回 `true`；
  - [ ] 按 `ARCHITECTURE.md` 步骤 4 做服务端通用化（`gameAction { gameId, action }`）后再开联机；
  - [ ] 补 TDM 模式选择 UI；
  - [ ] 补音效/特效与更完整的战斗反馈。
- [ ] 若做原版实时 FPS：
  - [ ] 先完成平台 realtime 能力（Room tick 循环、输入/快照协议、按 mode 分支）；
  - [ ] 再重写 `games/corcodragon-fire/` 为 3D 客户端 + 服务端权威模拟；
  - [ ] 严格遵守“每阶段 git 提交 + 全量测试 + 截图留档”规则。
- [ ] 重启时保留本文件，完成后更新状态并归档新版本。

## 7. 相关提交

- `d9f235f` feat：实现回合制引擎与 AI
- `9b56fd5` feat：接入大厅注册表与本地对局 UI
- `9a35cf5` test：UI 冒烟与结算截图
- `d643511` fix：死亡玩家延迟伤害重复结算
- `ec578cf` test：多分辨率布局 QA
- 后续：更名《鳄龙战场》并归档（本次提交）

## 8. 存档后的平台表现

- 大厅不再显示该游戏卡片（`available: false`）。
- `apps/web/src/games.tsx` 仍保留注册，路由代码保留，但普通用户无法进入。
- 出包魔法师的所有大厅/房间/连接功能不受影响。
