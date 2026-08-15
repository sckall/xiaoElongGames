# 《鳄龙咆哮》（corcodragon-fire）

2-7 人回合制英雄战术射击，作为 `games/<id>/` 游戏包接入小鳄龙之家大厅。

## 与需求文档的关系

需求文档描述的 3D 实时 FPS 形态需要平台层增加 tick/差量快照/输入流等
realtime 房间能力（见 `ARCHITECTURE.md` 的 realtime 路线）。本包遵循当前
`games/types.ts` 的 **turn-based GameEngine 契约**，在不改动大厅/房间/连接
代码的前提下，把「英雄射击」落地为事件驱动的回合制战术版：

- 5 位英雄：炎刃/影枭/铁壁/灵音/诡雷，各有一个主动技能 + 终极技能；
- 4 种武器：步枪/狙击枪/手枪/匕首，可随时切换；
- 9×9 竞技场、掩体与视线、暴击与随机命中（rng 可注入）；
- FFA 先到 5 杀获胜（TDM 已在引擎支持，平台未开放配置）。

## 动作契约（apply 全部白名单校验）

| 动作 | 说明 |
|------|------|
| `{type:'selectHero', hero}` | 英雄选择阶段选择英雄 |
| `{type:'move', to:{x,y}}` | 移动阶段移动到可达格 |
| `{type:'shoot', targetId}` | 射击可见敌人 |
| `{type:'switchWeapon', weapon}` | 切换武器（免费动作） |
| `{type:'reload'}` | 装弹（消耗行动） |
| `{type:'skill', to?, targetId?}` | 主动技能（按英雄取目标） |
| `{type:'ult', to?, targetId?}` | 终极技能（按英雄取目标） |
| `{type:'endTurn'}` | 结束回合 |

## 开发

```bash
pnpm --filter @tm/game-corcodragon-fire test
pnpm --filter @tm/game-corcodragon-fire typecheck
```

引擎零依赖，随机数通过构造参数注入，单测见 `test/engine.test.ts`。
