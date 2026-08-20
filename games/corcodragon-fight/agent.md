# 《鳄龙咆哮》(corcodragon-fight) 项目要求（Agent 必读）

> 本文件适用于 `games/corcodragon-fight/` 子项目的所有 agent 工作。
> 相关平台文档：`docs/ARCHITECTURE.md`、`docs/REALTIME.md`、`docs/DEVELOPMENT.md`。

## 1. Git 提交

- 每个阶段修改完成并通过本地验证后，**必须在 git 上提交**；
- 提交信息沿用现有风格：`<type>(<scope>): <描述>`，scope 用 `corcodragon-fight` / `server` / `docs` 等；
- 提交前 `git status` 自查，不夹带无关改动；未经用户明确指示不推送远端、不重写历史。

## 2. 截图存档

- 任何截图/录屏**必须存档**到 `docs-dev/screenshots/corcodragon-fight/`（本地留档；该目录被 gitignore，不随仓库分发）；
- 文件名带日期与用途，例：`2026-08-16-联机插值调试.png`；
- 截图前确认浏览器页面无敏感信息（账号、密码、个人数据）。

## 3. 视觉辅助

- 本项目**允许使用视觉辅助工具**：`node tools/vision.mjs <图片路径> ["附加问题"]`（智谱 GLM-4.6V-Flash）；
- 使用前先读 `.dsh/skills/vision/SKILL.md`；免费模型限流频繁，脚本内置 429/5xx 退避重试，单张可能耗时几十秒；
- 批量识图用 `--batch <图...> --out tools/vision-results/<名称>.json`，结果统一放 `tools/vision-results/`（gitignore）；
- 识别结果留存/引用后再下结论，必要时让模型按指定格式输出 JSON。

## 4. 跨项目 / 跨工作区全局操作

- 任何**跨项目或工作区外/全局操作**（端口监听、进程启停、依赖安装、系统目录、远程服务器、外网 API 等）必须先**谨慎评估**，并登记到 `docs-dev/RISK_LOG.md`（执行前写风险与缓解措施，执行后回填结果）；
- 高危或不可逆操作（sudo、系统设置修改、git 历史重写、删除远端数据）默认不做，必须先征求用户同意；
- 改动平台层（`apps/`、`packages/`）或其它子游戏（如《出包魔法师》）前，确认影响范围并在风险日志登记后再动。
