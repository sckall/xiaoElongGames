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

  // ============ hall（旧大厅文案，保留兼容） ============
  'hall.title': '🐊 小鳄龙之家',
  'hall.tagline': '选择游戏开始游玩',
  'hall.back': '← 返回首页',
  'hall.mode.turnBased': '回合制 · 实时房间',
  'hall.mode.async': '异步 · 小数据',
  'hall.mode.realtime': '同步 · 低延迟',
  'hall.playerCount': '{min}-{max} 人',
  'hall.cta': '进入游戏 →',

  // ============ lobby（开放世界内嵌的游戏大厅 · 赛博可爱风） ============
  'lobby.brand.title': '小鳄龙之家',
  'lobby.brand.subtitle': 'GATOR HOME',

  // 欢迎/招呼
  'lobby.greeting': 'おかえり、{name}！',
  'lobby.greeting.tag': '今日也元气满满鸭',

  // 顶部 HUD
  'lobby.hud.level': 'Lv.{level}',
  'lobby.hud.coins': '{count}',
  'lobby.hud.gem': '{count}', // 高级货币
  'lobby.hud.stamina': '体力 {cur}/{max}',
  'lobby.hud.exit': '返回',
  'lobby.hud.settings': '设置',

  // 左侧角色区
  'lobby.character.name': '鳄梨子',
  'lobby.character.title': '★ 看板娘 · No.{id}',
  'lobby.character.line': '主人，要开黑吗～',
  'lobby.character.cta': '每日签到',

  // 标题区
  'lobby.title': '游戏大厅',
  'lobby.subtitle': '选一个游戏，开始冒险',

  // 搜索 + 创建
  'lobby.search.placeholder': '搜游戏...',
  'lobby.createRoom': '快速开房',
  'lobby.random': '随缘一把',

  // 推荐区
  'lobby.section.featured': '★ 本周精选',
  'lobby.section.all': '✦ 全部游戏',

  // 卡片标签 / 徽章
  'lobby.card.badge.online': '🔥 热门',
  'lobby.card.badge.featured': '★ 推荐',
  'lobby.card.badge.upcoming': '敬请期待',
  'lobby.card.badge.beta': '公测',
  'lobby.card.status.smooth': '流畅',
  'lobby.card.status.busy': '繁忙',
  'lobby.card.status.normal': '一般',
  'lobby.card.status.idle': '占位',
  'lobby.card.action.enter': '进入',
  'lobby.card.action.soon': '敬请期待',
  'lobby.card.players': '{cur}/{max}',
  'lobby.card.tag.turn': '回合制',
  'lobby.card.tag.realtime': '同步',
  'lobby.card.tag.async': '异步',
  'lobby.card.like': '{count}',

  // 4 个游戏槽位
  'lobby.game.magician.name': '出包魔法师',
  'lobby.game.magician.desc': '瞎放魔法的欢乐桌游 · 看不见自己的手牌',
  'lobby.game.fight.name': '鳄龙咆哮',
  'lobby.game.fight.desc': '3D 实时英雄射击 · 5 英雄 × 4 武器自由混战',
  'lobby.game.fire.name': '鳄龙战场',
  'lobby.game.fire.desc': '回合制英雄战术 · 走位、射击、技能与终极技',
  'lobby.game.tavern.name': '小酒馆大冒险',
  'lobby.game.tavern.desc': '合作式地牢探索 · 即将上线',

  // 默认玩家名（HUD/角色卡 fallback）
  'lobby.user.name': '小鳄鱼',

  // 主界面新增
  'lobby.mail': '邮件',
  'lobby.mail.badge': '{count} 未读',
  'lobby.shop': '商店',
  'lobby.event': '活动',
  'lobby.friends': '好友',
  'lobby.start': '进入开放世界',
  'lobby.start.tag': '点击进入第三人称世界',
  'lobby.featured.title': '✦ 本周精选',
  'lobby.featured.subtitle': '限定活动 · 错过等一年',
  'lobby.featured.cta': '立即参与',
  'lobby.featured.countdown': '剩余 {day} 天',
  'lobby.chat.world': '[世界]',
  'lobby.chat.line1': '{name}：今晚一起开黑吗～',
  'lobby.chat.line2': '{name}：鳄龙咆哮上线了，快冲！',
  'lobby.chat.placeholder': '说点什么...',
  'lobby.daily.title': '每日签到',
  'lobby.daily.desc': '连续 {day} 天 · 奖励 x{count}',
  'lobby.daily.cta': '已签到',
  'lobby.level.bonus': '升级奖励',
  'lobby.exp': '{cur} / {max}',
  'lobby.menu.daily': '每日',
  'lobby.menu.gacha': '扭蛋',
  'lobby.menu.achievement': '成就',
  'lobby.menu.club': '社团',
};