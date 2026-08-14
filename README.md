# 🧙 出包魔法师（Trouble Magician）

《出包魔法师》桌游的网页电子版。按「简洁版 → 复杂版 → 联机版」三步迭代完成，
每一步都有独立 git 提交与 tag，可通过 `git log` / `git checkout <tag>` 回溯查看。

- 规则规格：`出包魔法师桌游基本规则.md`
- 操作风险日志：`RISK_LOG.md`

## 迭代版本（git tags）

| 版本 | tag | 内容 |
|------|-----|------|
| v1 简洁版 | `v1-simple` | 完整规则引擎 + 文字/emoji UI，本地 vs AI 可玩 |
| v2 复杂版 | `v2-rich` | 素材化卡牌 UI（CSS 渐变主题）、施法横幅/伤害飘字/骰子/彩带动画、合成音效 |
| v3 联机版 | `v3-online` | 房间制在线对战（4 位房间码）、AI 补位、断线自动托管与重连 |

```bash
git log --oneline            # 查看迭代过程
git checkout v1-simple       # 回到简洁版代码
git diff v1-simple v2-rich   # 对比两版差异
```

## 玩法简介

- 36 张魔法牌、8 种魔法（每种 1~8 张）。你的手牌**背对自己**：你看不到自己的牌，但能看到所有人的牌。
- 轮到你喊出一个魔法名：手里有 → 打出并生效，可继续施法（下一张不能比上一张更稀有）；没有 → **出包**！扣 1 生命并强制结束回合（巨龙失败扣 1~3）。
- 回合结束补牌至 5 张；生命上限 6，每轮重置；猫头鹰可偷看秘密牌，存活时每张 +1 分。
- 一轮结束：击杀他人 +3（其他存活者 +1）；放完手中所有魔法 +3（其他人 0）；自杀则其他人各 +1。
- 先到 8 分且分数最高者获胜。
- 完整规则见设置页「规则速览」与根目录规则文档。

## 快速开始（本地开发）

```bash
pnpm install
pnpm dev          # 同时启动前端(5173)与服务端(8787)，前端已代理 /socket.io
# 打开 http://127.0.0.1:5173
```

- 本地 vs AI：首页选「本地 vs AI」。
- 联机：启动两个浏览器窗口（一个开 5173），创建房间 → 复制房间码 → 另一个窗口加入，即可对战；单人也可用「AI ×N」补位开房。

## 测试与构建

```bash
pnpm test                      # 规则引擎 30 个单测（含 60 局随机对局模糊测试）
pnpm typecheck                 # 全部包类型检查
pnpm build                     # 构建前端（apps/web/dist）

# 联机端到端冒烟（先起服务端）：
pnpm dev:server &
node apps/server/scripts/smoke.mjs http://127.0.0.1:8787
```

## 目录结构

```
packages/rules       核心规则引擎（纯 TS，无副作用）：引擎 + 视角投影 + AI 推理 + 共享协议
apps/web             React 前端：本地/联机双模式、大厅、动画特效、音效
apps/server          Socket.IO 服务端：房间、断线托管、静态托管
docs/DEPLOY.md       腾讯云部署指南（Docker / 裸机 systemd / nginx+HTTPS）
docs/nginx.conf      nginx 反代示例（含 WebSocket 配置）
docs/tm-server.service  systemd 单元（裸机方案）
Dockerfile / docker-compose.yml   容器化部署
scripts/deploy.sh    一键部署脚本（rsync + docker compose，见 .env.example）
```

## 关键设计

- **信息模型**：引擎维护全量状态，`getView(playerId)` 按玩家视角投影（隐藏自己手牌、他人秘密牌）。
- **公平 AI**：AI 只用玩家可见信息，通过超几何分布推理自己手牌概率，决策不偷看自己的牌。
- **断线托管**：联机对局中任何座位断线/离开，由服务端 AI 接管，其余玩家无感知；凭 token 重连恢复。
- **单进程部署**：服务端同端口托管前端静态资源，一个容器即可上线。

## 部署到腾讯云

见 [docs/DEPLOY.md](docs/DEPLOY.md)（Docker Compose 推荐，另有裸机 systemd 与域名 HTTPS 方案）。
