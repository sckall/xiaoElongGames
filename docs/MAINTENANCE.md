# 🔧 MAINTENANCE · 维护与贡献手册

> **给维护者**：每次开新任务前先看这份文档。包含任务流转、commit 规范、PR 流程、代码规范、文档维护约定。
> 项目路线图见 [ROADMAP.md](ROADMAP.md)；商业化决策见 [COMMERCIAL.md](COMMERCIAL.md)。

## 一、任务流转（每次开工前先看这里）

### 1.1 找到当前阶段的任务

```bash
# 看最近 5 次 commit 了解进度
git log --oneline -5

# 看 ROADMAP 当前阶段的任务表
cat docs/ROADMAP.md | head -80
```

**当前阶段**：阶段 0「稳固基线」。任务表见 [ROADMAP.md § 阶段 0](ROADMAP.md#-阶段-0稳固基线当前)。

### 1.2 开工前检查清单

- [ ] 我在 ROADMAP 当前阶段任务表里找过对应任务
- [ ] 我读了相关已有文档（ARCHITECTURE / DEVELOPMENT / SECURITY / 本阶段对应文档）
- [ ] 我看了相关代码（用 `grep`/`read` 而不是猜测）
- [ ] 我知道这个任务会影响哪些包（`apps/*` `packages/*` `games/*`）
- [ ] 我的改动不破坏架构约束（见 § 五）

### 1.3 收工检查清单

- [ ] `pnpm typecheck` 全过
- [ ] `pnpm test` 全过（177+ 单测）
- [ ] `pnpm build` 成功
- [ ] 回合制冒烟通过：`node apps/server/scripts/smoke.mjs http://127.0.0.1:8789`
- [ ] realtime 冒烟通过：`TM_SERVER=http://127.0.0.1:8789 node apps/server/scripts/smoke-realtime.mjs`
- [ ] commit message 含阶段标签（如 `(stage-0)`）
- [ ] 涉及文档更新（接口/路径/概念变更）的，已同步到 `docs/`

---

## 二、Commit 规范

### 2.1 消息格式

```
<type>(<scope>): <subject> [stage-N]

<body>

<footer>
```

**type**（必填，conventional commits 风格）：
- `feat` — 新功能
- `fix` — 修复 bug
- `docs` — 仅文档变更
- `style` — 不影响逻辑的格式/排版
- `refactor` — 重构（既不是新功能也不是修复）
- `perf` — 性能优化
- `test` — 测试相关
- `build` — 构建系统/依赖变更
- `ci` — CI 配置
- `chore` — 其他杂项（不修改 src 或 test）

**scope**（可选）：`web` `server` `rules` `trouble-magician` `corcodragon-fight` `vite` `deps` `docs` 等

**subject**（必填，祈使句，首字母小写，不超过 72 字符，末尾不加句号）：
- ✅ `feat(corcodragon-fight): add steam deck controller mapping`
- ❌ `Add Steam Deck Controller Mapping`

**stage-N**（可选，推荐）：关联到 ROADMAP 阶段
- `(stage-0)` `(stage-1)` `(stage-2)` ...

**body**（可选）：说明「为什么」而不是「做什么」（diff 自己看得到）
- 用空行分隔段落
- 引用 issue / 文档：`Refs docs/ROADMAP.md § 阶段 0`

**footer**（可选）：
- `BREAKING CHANGE: <描述>`（注意是大写）
- `Refs #123`、`Closes #456`

### 2.2 示例

```
feat(web): 抽出 UI 文案到 i18n 模块 (stage-0)

- apps/web/src/i18n/zh-CN.ts 集中管理所有面向用户的中文文案
- 组件层改为 t('xxx') 调用
- 全项目无硬编码中文（grep 验证：0 处匹配）
- 为未来 en-US i18n 预留接口

Refs docs/ROADMAP.md § 阶段 0 P1
```

```
fix(server): protocol.ts 加 userId 字段预留 (stage-0)

- ClientToServer / ServerToClient 事件统一加 userId?: string
- 服务端对缺失 userId 兼容（fallback 到旧行为）
- 协议版本号 v8.1（向后兼容）

Refs docs/COMMERCIAL.md § 六「现在就能做的低成本准备」
```

```
fix(corcodragon-fight): 修复影枭攻击后未立即显形

复现：开局隐身 → 命中 → 预期退出隐身，实际仍隐身
根因：state.transition 中 visibility 字段未联动 effect 生命周期
验证：新增 test/visibility.test.ts 2 个用例；全量测试 179 通过

Refs #234
```

### 2.3 不允许的 commit

- ❌ `wip`、`fix typo`、`update` 这类无意义信息
- ❌ 一个 commit 改多件事（请拆 PR）
- ❌ commit message 用英文/中文混排（保持一致：建议中文）
- ❌ 超过 200 行的 commit（视为重构风险）

---

## 三、分支策略

### 3.1 模型

简化的 GitHub Flow（更适合小项目）：

```
main           ← 永远可发布，所有 CI 通过
  ├─ feat/*    ← 新功能
  ├─ fix/*     ← 修复
  ├─ docs/*    ← 文档
  └─ refactor/*← 重构
```

### 3.2 流程

1. 从最新 `main` 建分支：
   ```bash
   git checkout main && git pull
   git checkout -b feat/i18n-extract
   ```
2. 在分支上开发，commit 多次（按 § 二规范）
3. 推送到远程 + 开 PR（**先本地跑完 § 1.3 检查清单再 push**）
4. PR 标题 = commit 标题；描述包含：
   - 关联的 ROADMAP 阶段任务
   - 测试通过截图/日志
   - 影响范围（哪些文件、哪些 API）
5. 自我 review → merge 到 `main`（单人项目可直 merge）

### 3.3 分支命名

```
feat/<scope>-<verb>          feat/i18n-extract
fix/<scope>-<issue-name>     fix/server-protocol-userid
docs/<topic>                 docs/roadmap-update
refactor/<scope>-<goal>      refactor/corcodragon-engine-tick
chore/<verb>                 chore/bump-threejs-version
```

---

## 四、PR / Review 流程

### 4.1 开 PR 前

- [ ] 本地 `pnpm test typecheck build` 全过
- [ ] 跑过两个冒烟（见 § 1.3）
- [ ] commit message 符合 § 二
- [ ] 文档同步（如适用）

### 4.2 PR 描述模板

```markdown
## 关联任务
- ROADMAP 阶段：阶段 0 P1 第 3 行
- 任务：UI 文案抽到 i18n/zh-CN.ts

## 改动
- 简述 1
- 简述 2

## 测试
- [x] pnpm test（177 通过）
- [x] pnpm typecheck
- [x] 回合制冒烟
- [x] realtime 冒烟
- [ ] 截图/录像（如有 UI 变更）

## 影响范围
- apps/web/src/** （UI 文案）
- apps/web/src/i18n/** （新增）

Refs docs/ROADMAP.md
```

---

## 五、架构约束（**改之前必读，违反会被驳回**）

> 来源：[ARCHITECTURE.md](ARCHITECTURE.md) § 约束与约定

### 5.1 不可破坏的不变量

1. **信息模型不可破坏**：任何新状态字段都要过 `getView` 投影，禁止把全量状态直接下发
2. **引擎保持零依赖、可注入随机**：便于单测与未来迁移（如 boardgame.io）
3. **协议改动 = 双端一起改**：`protocol.ts` 是唯一事件契约；服务端对所有入参做白名单/数值校验
4. **本地/联机 UI 共用**：新界面逻辑放 `GameTable`/组件，行为差异通过 `GameApi` 适配
5. **依赖方向（单向）**：`apps → games → games/types`，`apps/server → @tm/rules`
   - `games` **不得** import `apps`
   - `packages/rules` **不得** import `games`

### 5.2 改协议前必须做的事

- 协议版本号（在 `protocol.ts` 顶部常量）**递增**
- 服务端对旧/新协议都要能处理（向后兼容至少 1 个版本）
- 协议文档（本文档或 `ARCHITECTURE.md`）同步更新
- 冒烟脚本加新协议测试用例

### 5.3 加新游戏前必须做的事

按 [ARCHITECTURE.md § 新游戏接入指南](ARCHITECTURE.md#新游戏接入指南平台游戏两层分离) 走：
1. 在 `games/<id>/` 实现引擎与 AI
2. 写 `index.ts` 导出 `GameModule`
3. 在 `games/registry.ts` 的 `GAMES` 数组登记
4. 服务端通用化（第二个游戏接入时做）
5. UI 按 `gameId` 路由
6. 验收：引擎单测 + 全量测试 + 冒烟 + 双窗口回归

---

## 六、代码规范

### 6.1 TypeScript

- **严格模式**：`tsc --strict` 已在 `tsconfig.base.json`
- **零 `any`**：能不用就不用；必须用时加注释说明原因
- **类型导出**：从 `types.ts` 统一导出，不在组件层 inline 定义
- **文件命名**：`PascalCase`（类/组件）/ `camelCase`（变量/函数）/ `kebab-case`（文件名，部分保留）

### 6.2 React

- **函数组件 + hooks**（不用 class）
- **状态管理**：优先 `useState`/`useReducer`，跨组件用 props 或 context；不用 Redux（项目目前没有）
- **副作用**：`useEffect` 必须有完整依赖数组
- **性能**：`useMemo`/`useCallback` 只在确有性能问题时用，不要「为用而用」
- **目录组织**：`apps/web/src/<page>/<Component>.tsx` + 同目录 `<Component>.test.tsx`

### 6.3 测试

- **覆盖率目标**：规则引擎 / 服务端鉴权 ≥ 90%；UI 组件 ≥ 30%
- **测试文件**：`*.test.ts`（vitest）
- **每个修复 bug 必须带回归测试**
- **新增公共函数必须有测试**

### 6.4 样式

- **CSS**：组件级 `.css` 文件，与组件同名同目录
- **不要用** 内联样式（除非动态计算）
- **变量**：用 CSS 自定义属性集中管理（在 `index.css` / `game.css` 顶部）
- **避免**：魔法值（颜色/间距），提到变量

### 6.5 错误处理

- **不要** `console.error` 直接抛
- **统一封装**：用 `apps/web/src/log.ts` 的 `logError()` / `apps/server/src/log.ts` 的 `logError()`
- **协议事件**：服务端对所有入参 try/catch，非法 payload 返回 `{ ok: false, error }`

---

## 七、文档维护约定

### 7.1 何时更新文档

| 改了 | 更新 |
|------|------|
| 新增/删除 API | 同步 ARCHITECTURE.md + 对应 GAME.md |
| 改协议 | 同步 ARCHITECTURE.md + protocol.ts 顶部版本号注释 |
| 改部署流程 | 同步 DEPLOY.md |
| 改安全策略 | 同步 SECURITY.md |
| 改 commit/PR 规范 | 同步 MAINTENANCE.md |
| 改阶段任务 | 同步 ROADMAP.md（勾选 + 写新的「关键任务表」） |
| 改商业化策略 | 同步 COMMERCIAL.md |

### 7.2 CHANGELOG.md 写入规范

每个阶段结束时写一条；遵循仓库根 `CHANGELOG.md` 已有格式：

```markdown
## v0.2.0 — 阶段 0 收尾（2025-XX-XX）

- ✅ feat: ... (stage-0)
- ✅ fix: ... (stage-0)
- ✅ docs: 新增 ROADMAP/COMMERCIAL/MAINTENANCE 三件套
```

---

## 八、紧急情况处理

### 8.1 端口冲突

```bash
# 查看占用
lsof -nP -iTCP:8787,8788,8789 -sTCP:LISTEN
# 用环境变量换端口（推荐方式，0 文件改动）
PORT=8889 HOST=127.0.0.1 TM_WEB_PORT=5174 TM_SERVER_PORT=8889 pnpm dev
```

### 8.2 类型错误

```bash
pnpm typecheck    # 全部包
# 单包定位
pnpm --filter @tm/web typecheck
```

### 8.3 单测红了但找不到原因

```bash
# 跑单个测试文件
pnpm --filter @tm/rules test engine.test.ts
# 开启详细输出
pnpm --filter @tm/rules test -- --reporter=verbose
```

### 8.4 dev 起不来

```bash
# 看完整日志（不要只 tail）
pnpm dev 2>&1 | tee /tmp/dev.log
# 检查依赖
pnpm install
# 清缓存
rm -rf node_modules apps/*/node_modules games/*/node_modules packages/*/node_modules
pnpm install
```

---

## 九、每日开工/收工节奏（建议）

### 开工
```bash
cd <项目>
git status && git log --oneline -5
cat docs/ROADMAP.md | head -80  # 看阶段 0 任务表
pnpm install  # 保险
pnpm dev      # 占 5174/8789
```

### 收工
```bash
pnpm typecheck && pnpm test
node apps/server/scripts/smoke.mjs http://127.0.0.1:8789
TM_SERVER=http://127.0.0.1:8789 node apps/server/scripts/smoke-realtime.mjs
git add -A && git commit -m "..."  # 按 § 二 规范
```

---

## 十、文档索引

| 我要看 | 读这里 |
|--------|--------|
| **架构 / 数据流 / 接入新游戏** | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **从零装环境 / 跑测 / 打包** | [DEVELOPMENT.md](DEVELOPMENT.md) |
| **服务端部署 / Docker / 运维** | [DEPLOY.md](DEPLOY.md) |
| **实时 FPS 通道设计** | [REALTIME.md](REALTIME.md) |
| **战斗判定与弹道** | [COMBAT.md](COMBAT.md) |
| **射击手感调校** | [SHOOTING-FEEL.md](SHOOTING-FEEL.md) |
| **手动调数值（gameplay.json + ?debug=1）** | [GAMEPLAY-TUNING.md](GAMEPLAY-TUNING.md) |
| **素材来源 / 许可 / 替换计划** | [ASSETS.md](ASSETS.md) |
| **服务端安全边界 / 加固清单** | [SECURITY.md](SECURITY.md) |
| **出包魔法师完整规则** | [出包魔法师桌游基本规则.md](出包魔法师桌游基本规则.md) |
| **GitHub Pages 部署** | [GITHUB-PAGES.md](GITHUB-PAGES.md) |
| **🆕 项目路线图（2025-2027）** | [ROADMAP.md](ROADMAP.md) |
| **🆕 商业化与 Steam 策略** | [COMMERCIAL.md](COMMERCIAL.md) |
| **🆕 维护与贡献手册** | [MAINTENANCE.md](MAINTENANCE.md) ← 你在这里 |
| **更新日志** | [CHANGELOG.md](../CHANGELOG.md) |