/**
 * 简体中文文案（zh-CN）
 *
 * ## 命名规范
 * - 全小写，点号分隔：`<namespace>.<page>.<element>`
 * - 例子：`home.title`、`hall.tagline`、`hall.mode.turnBased`
 * - 占位符用花括号：`{name}`、`{count}`
 *
 * ## 抽取策略
 * - **第一阶段**（本 PR）：抽取首页 + 大厅（App.tsx / HallScreen.tsx）
 * - **后续 PR**：按文件分批抽取（每个 PR 一个文件，避免巨型 diff）
 *
 * ## 暂不抽取的内容
 * - 动态数据驱动的文案（`@tm/rules` 的 `MAGIC_DEFS[magic].name` 等）
 * - 服务端 message（`error: '密码错误'` 等需要单独抽取）
 * - 第三方库返回的文案
 * - CSS 中的注释/内容（styles.css）
 */

export const zhCN: Record<string, string> = {
  // ============ home（首页，App.tsx） ============
  'home.loading': '🐊 正在准备战场……',
  'home.brand': '🐊 小鳄龙之家',
  'home.brandSubtitle': 'Game Hall · 游戏大厅',
  'home.tagline': '选择游戏，和朋友一起玩',
  'home.nameLabel': '你的名字',
  'home.enterHall': '🎮 进入游戏大厅',

  // ============ hall（大厅，HallScreen.tsx） ============
  'hall.title': '🐊 小鳄龙之家',
  'hall.tagline': '选择游戏开始游玩',
  'hall.back': '← 返回首页',
  'hall.mode.turnBased': '回合制 · 实时房间',
  'hall.mode.async': '异步 · 小数据',
  'hall.mode.realtime': '同步 · 低延迟',
  'hall.playerCount': '{min}-{max} 人',
  'hall.cta': '进入游戏 →',
};