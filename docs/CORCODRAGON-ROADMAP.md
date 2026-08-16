# 《鳄龙咆哮》路线图与规划（未排期项）

> 本文记录“已确认要做但当前不做”的规划项，进入开发时再拆解。

## 已确认规划（不做，仅排期）

### 1. 地形改造（复杂地形）

- 目标：参考 CS / VALORANT / OW 的地图设计，加入坡道、台阶、高低差、多层平台、
  更丰富的墙体结构与主题化场景。
- 前置条件：
  - 当前引擎碰撞是 **XZ 平面 AABB**（`OBSTACLES` + 圆形玩家），只支持平地上的
    掩体与围墙；需要升级为带高度的 3D 碰撞（AABB/棱柱 + 可踩踏面 + 台阶攀爬）。
  - 服务端移动物理需支持：可站立平台、跳上矮台/台阶（step-up）、高低差伤害判定、
    视线/弹道高度遮挡等。
- 建议分两步：先“视觉复杂化”（不改变物理，用模块化套件装饰现有 AABB），
  再“真垂直地形”（重写引擎碰撞）。视觉模块化套件候选：
  - [KayKit Dungeon Remastered（CC0，200+ 模块）](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0)
  - Kenney 系列（CC0，官网/itch.io）

### 2. 地图编辑器

- 目标：可视化编辑 `OBSTACLES` / 出生点 / 特效点位，导出地图配置（JSON），
  加载到本地与联机对局。
- 建议形态：开发用 Web 编辑器（复用 Three.js + tweakpane），
  `?debug=1&mapEditor=1` 打开；服务端读取 `gameplay.json` 之外的地图 JSON。
- 前置条件：
  - 地图数据从 `defs.ts` 硬编码迁移到可加载 JSON（含掩体 AABB、出生点、装饰物）。
  - 服务端与客户端共用地图 schema 校验（与 `balance.ts` 同类）。
  - 保存/导出/版本管理（先存 `assets/maps/*.json`）。
- 引擎侧需要：地图热加载、非法地图整体拒绝、训练场/联机房间可选地图。

## 其它候选（未排期）

- 延迟补偿（lag compensation）：`docs/COMBAT.md` 路线 1。
- 角色动画：当前 KayKit 静态模型，后续可接入 idle/run/jump 动画混合。
- 受击方向指示器、弹道轨迹升级：`docs/COMBAT.md` 路线 2/5。
