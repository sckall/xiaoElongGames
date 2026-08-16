# 🐊 小鳄龙之家 · 游戏大厅

「小鳄龙之家」是一个网页游戏大厅，当前入驻：

- **《出包魔法师》（Trouble Magician）**：见习魔法师聚在一起乱放魔法——你的手牌背对自己，
  看不到自己会什么，只能靠观察别人来猜；喊对魔法生效，喊错就出包扣血。支持本地 vs AI 与联机房间对战。
- **《鳄龙咆哮》（corcodragon-fight）**：2-7 人 3D 实时英雄射击，5 位英雄 × 4 种武器，
  20Hz 服务端权威联机（Socket.IO + Three.js）。详见 `games/corcodragon-fight/README.md`。

- 游戏规则规格：`出包魔法师桌游基本规则.md`

## 📚 文档索引

| 文档 | 面向 | 内容 |
|------|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 开发者 / Agent | 项目架构、前后端职责、数据流、文件与接口说明 |
| [CHANGELOG.md](CHANGELOG.md) | 所有人 | 版本更新日志（v1 ~ 最新） |
| [docs/REALTIME.md](docs/REALTIME.md) | 开发者 / Agent | 实时 FPS 通道设计（tick/快照协议/断线语义/演进路线） |
| [docs/GAMEPLAY-TUNING.md](docs/GAMEPLAY-TUNING.md) | 策划 / 开发者 | 《鳄龙咆哮》手感调参（gameplay.json + `?debug=1` 面板） |
| [docs/ASSETS.md](docs/ASSETS.md) | 美术 / 开发者 | 素材来源（CC0 音效/模型）、已接入资产与后续替换计划 |
| [docs/COMBAT.md](docs/COMBAT.md) | 开发者 | 战斗判定与弹道算法（hitscan/近战/延迟补偿路线） |
| [docs/SHOOTING-FEEL.md](docs/SHOOTING-FEEL.md) | 策划 / 开发者 | 成熟 FPS 手感公式、本项目落地与训练场验证方法 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | 运维 | 服务端详细部署（系统要求/依赖/命令/测试/发布包） |

## 🎮 客户端形态（重要）

**本项目没有独立客户端包**。客户端就是浏览器：

- 前端构建产物 `apps/web/dist` 是纯静态文件（HTML/JS/CSS），由服务端**同端口托管**；
- 部署一个服务端包 = 客户端 + 服务端都有了，玩家访问 `http://<服务器>:<端口>` 即玩；
- **单人 vs AI 模式完全在浏览器内运行规则引擎，不依赖任何服务器**。

**本地单机入口**（给不搞开发的玩家）：

```bash
node scripts/pack-local.mjs
# 产物：release/gator-hall-local-<版本>.tar.gz（约 0.1MB）
# 解压后双击「启动.command」(macOS) 或「启动.bat」(Windows) 即玩，
# 无需 Node/pnpm——仅用系统 Python 托管静态文件（127.0.0.1:8123，仅本机可访问）。
# 服务自动关闭：关掉启动窗口立即停；即使忘关，闲置 10 分钟也自动退出，不留后台进程。
# 该包内联机模式仍可用：游戏内填已部署公网服务器的地址即可。
```

开发时则是 `pnpm dev`（vite dev server 只是加载页面的工具，不是游戏服务端；
游戏服务端 8787 只有联机模式才需要）。

## 🚀 本地开发

```bash
# 环境要求：Node.js ≥ 20，pnpm ≥ 9（本项目锁 pnpm 11.7，corepack 可自动启用）
pnpm install
pnpm dev          # 前端(5173) + 服务端(8787)；前端已代理 /socket.io
# 打开 http://127.0.0.1:5173
```

- 前端 dev 默认 `host: true`，局域网设备可经 `http://<你电脑IP>:5173` 访问；
- 联机客户端默认同源连接（开发经 vite 代理、生产同端口），无需配置。

## 🧪 测试

```bash
pnpm test                        # 规则引擎单测（含 60 局随机对局模糊测试）
pnpm typecheck                   # 全部包 TS 类型检查
pnpm build                       # 构建前端 apps/web/dist
pnpm --filter @tm/web preview    # 预览生产构建

# 联机端到端冒烟（需先起服务端）：建房/密码/设置/对战至终局/断线重连/关房/恶意 payload
node apps/server/scripts/smoke.mjs http://127.0.0.1:8787
# 同机双窗口联机回归（历史 bug：token 顶号导致无法开局）
node scripts/e2e-twowindow.mjs
# 多分辨率布局 QA（4 视口）
node scripts/qa-layout.mjs

# —— 《鳄龙咆哮》realtime 专属 ——
node apps/server/scripts/smoke-realtime.mjs        # realtime 端到端冒烟（需服务端）
node scripts/smoke-corcodragon-fight.mjs           # 3D 本地冒烟 + 截图（TM_MODE=tdm|training 可选）
node scripts/e2e-twowindow-corcodragon.mjs         # 双窗口联机回归 + 截图（需前端+服务端）
node scripts/qa-layout-corcodragon-fight.mjs       # 桌面/平板/手机三档布局 QA（需前端）
node scripts/smoke-tuning.mjs                      # 手感调试面板冒烟（需前端，?debug=1）
# 界面截图（存 docs/screenshots/ 与 tools/vision-results/shots/）
node scripts/shots.mjs && node scripts/shots-5p.mjs
```

## 📦 发布打包

```bash
node scripts/pack-release.mjs   # 生成 release/trouble-magician-<版本>.tar.gz
```

服务器解压后 `pnpm install --frozen-lockfile --prod && PORT=8080 pnpm --filter @tm/server start`。
详见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## ⚙️ 配置项

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `PORT` | 服务端监听端口 | `8787` |
| `HOST` | 服务端监听地址（仅本机 = `127.0.0.1`，公开 = `0.0.0.0`） | `0.0.0.0` |
| `CORS_ORIGIN` | 跨源白名单（逗号分隔）；默认仅同源，前后端分离部署时才需要 | 空（同源） |
| `TM_WEB` | 截图/回归脚本的目标地址 | `http://127.0.0.1:5173` |
| 客户端设置 | 昵称/音效/动画/战报/AI 节奏/服务器地址，存浏览器 localStorage（`tm-settings`、`tm-room-tokens`） | — |

部署脚本 `scripts/deploy.sh` 的服务器凭据在 `.env.deploy`（模板见 `.env.example`，已 gitignore）。

## ⚠️ 运行注意事项

1. **开发与生产端口不同**：dev 前端 5173（经代理连 8787）；生产只有服务端一个端口（托管静态产物）。
2. **服务端无持久化**：对局即开即散，重启清空所有房间（无数据库，属预期设计）。
3. **房间码 4 位**（约 100 万组合）：当前规模够用；公开运营前建议扩位/加账号体系。
4. **联机对局是权威服务端**：客户端只收「以我为视角」的投影状态，防作弊依赖此设计，改协议时勿破坏。
5. **战报日志默认隐藏**：这是玩法设计（逼迫玩家记忆出牌），不是 bug；设置里可开。
6. 系统开启「减弱动态效果」时全屏施法特效以静态形式呈现（已适配，见 v7 变更）。

## 迭代历史

`CHANGELOG.md` 有完整版本日志；git tags：`v1-simple`、`v2-rich`、`v3-online`、`v3-deploy`（v4 之后按 commit 记录）。
