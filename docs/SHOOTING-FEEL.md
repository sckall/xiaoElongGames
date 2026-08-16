# 《鳄龙咆哮》射击手感调校方案（成熟 FPS 参考）

> 调研结论：CS / Valorant / COD 的“手感”不是单一参数，而是**判定、视觉、听觉三件事
> 同步反馈**。本文记录我们借鉴的调校清单与在本项目的落地位置。

## 1. 成熟产品的手感公式（调研整理）

| 维度 | 成熟做法 | 参考 |
|------|----------|------|
| 精度模型 | 基础散布 + **连续射击膨胀(bloom)** + 停止射击后指数恢复；开镜压散布 | CS:GO/Valorant 首发精准，连发扩散；见 [天美 FPS 数值解构](https://www.zhihu.com/question/25984519/answer/2564215888) 与 [枪械数值篇](https://www.gameres.com/915851.html) |
| 后坐 | 视觉上跳 + **弹着点分离**（准星回正比实际后坐快） | [CS级FPS手感四大底层契约](https://blog.csdn.net/weixin_34221654/article/details/161331315) |
| 准星 | 动态 gap：移动/跳跃/开火时扩张，静止时收敛；命中变红 X | [FPS射击手感优化全攻略](https://blog.csdn.net/qq_33060405/article/details/149482340) |
| 命中反馈 | 身体命中短促“哒”、爆头高音“叮”、击杀确认音；伤害数字与命中标记 | 全部主流 FPS |
| 枪械节奏 | 每把武器独立的射速/散布/衰减/开镜 FOV/后坐曲线 | [recoil patterns 参考](https://github.com/raduacg/game-mechanics-optimizations/blob/main/107_recoil_patterns.md) |
| 环境一致性 | 准星颜色与场景主色互补；暗场景用高亮准星 | [FPS准星颜色讨论](https://blog.csdn.net/qq_33060405/article/details/136050473) |

## 2. 本项目已落地（gameplay.json 可实时调）

- **散布膨胀**：`weapons.*.bloomPerShot`（每发+）、`bloomMax`（上限）、
  `bloomRecoveryPerSec`（每秒恢复）；开镜时膨胀只按 30% 计入；切枪/重生清零。
- **动态准星**：`?debug=1` 下可见 gap 随 `spreadBloom`、移动、开火节奏实时扩张/收敛。
- **后坐视觉**：`weapons.*.recoil` 视角上跳 + 枪模回退；判定用服务端散布（不叠加作弊）。
- **命中反馈**：身体命中=短促“哒”（高低频双声）、爆头=双音“叮”、击杀=确认音；
  准星命中红 X + 中央伤害数字（白色=命中、金色=爆头、红色=受击）+ 火花。
- **统计**：快照带 `shots/hits/headshots/damageDealt`，训练场直接显示命中率/爆头率。

## 3. 建议的调校顺序（配合 ?debug=1 + 移动测试 AI）

1. 每把枪先定 **TTK 目标**（如步枪 4 发身体/2 发爆头），调 `damage` 与 `interval`；
2. 调 `spread` 首发精度 → `bloomPerShot/bloomMax` 控制连发惩罚 → `bloomRecoveryPerSec` 控制节奏；
3. 调 `recoil` 与 `adsFov` 拉出每把枪的性格（狙击大后坐+深开镜）；
4. 开训练场四种靶子打 30 发，看命中率：固定靶应 >90%，移动靶 40-70% 为舒服区间。

## 4. 下一步

- 后坐图案化（每把枪独立 vertical/horizontal 曲线，参考 CS 固定 pattern）；
- 延迟补偿与开火者回滚（公网公平性）；
- 音效替换 CC0 实录音（保留程序化 fallback）。
