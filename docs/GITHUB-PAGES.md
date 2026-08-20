# GitHub Pages 部署指南（纯静态 · 仅单人 vs AI）

> 适用：只想把《小鳄龙之家》大厅免费部署成网页，玩家打开链接即可玩
> **单人 vs AI / 训练场**（规则引擎完全在浏览器内运行）。
> 不适用：联机对战。GitHub Pages 是纯静态托管，跑不了 Socket.IO 服务端；
> 联机需另部署游戏服务器，并解决下文「混合内容」问题。

## 1. 原理

- `apps/web/dist` 是纯静态产物（HTML/JS/CSS/GLB 模型），无任何后端逻辑；
- 单人 vs AI 模式在浏览器内直接 tick 引擎，不依赖服务器；
- 仓库已配置 `vite base: './'`（相对资源路径），因此可部署在
  `https://<owner>.github.io/<repo>/` 这种**子路径**下，也可部署到根路径或自定义域名；
- 仓库自带 `.github/workflows/pages.yml`：推送 `main` 自动构建并部署。

## 2. 首次启用（一次性）

1. 确认仓库满足 Pages 条件：
   - 仓库为 **public**（免费即可）；private 仓库需要 Pro/Team/Enterprise 计划；
   - 仓库 `Settings → Actions → General` 允许 GitHub Actions 运行。
2. 打开 `Settings → Pages`：
   - **Source** 选 **GitHub Actions**（本仓库已提供 workflow，不要选「从分支部署」）。
3. 触发首次部署（二选一）：
   - 推送代码到 `main`；
   - 或在 `Actions → Deploy to GitHub Pages → Run workflow` 手动运行。
4. 等待 workflow 完成后，`Settings → Pages` 顶部会出现站点地址：
   `https://<owner>.github.io/<repo>/`。首次部署通常 1~3 分钟。

> 站点地址与仓库名一致；改仓库名会让地址变化，需要重新访问新地址。

## 3. 日常更新

- 任何 `main` 分支 push 都会自动构建部署；也可以在工作流页面手动 `Run workflow`；
- `apps/web/dist` 无需提交到仓库（已在 `.gitignore`）；
- 上线前建议本地先构建验证：`pnpm build`。

本地模拟子路径验证（可选）：

```bash
pnpm build
mkdir -p /tmp/gh-pages-check/<repo> && cp -R apps/web/dist/* /tmp/gh-pages-check/<repo>/
cd /tmp/gh-pages-check && python3 -m http.server 8124
# 打开 http://127.0.0.1:8124/<repo>/ ，进入大厅、开一局本地 vs AI
# 验证完 Ctrl+C 停止
```

## 4. 注意事项

### 4.1 资源路径不要改回绝对路径

- `apps/web/vite.config.ts` 中的 `base: './'` 是子路径部署的关键；
  改成 `/` 会导致资源 404（浏览器会去 `github.io/` 根下找资源）。
- workflow 会自动在产物中放 `.nojekyll`，避免 Jekyll 忽略下划线开头的文件；
  请勿删除这一步。

### 4.2 没有 URL 路由，刷新不会 404

- 当前大厅用 React 状态切换页面，**没有** `history`/path 路由，
  访问根地址即完整应用；直接分享站点根链接即可。
- 如果未来引入 path 路由，需为 GitHub Pages 补充 `404.html` 回退或改用 hash 路由。

### 4.3 首次进入游戏会加载较大的 3D 素材

- 《鳄龙咆哮》按需分包：大厅首屏不加载 Three.js；进入游戏详情/对局时才加载
  GLB 英雄模型（每个约 3.5MB）。这是正常现象，不是部署失败；
- GitHub Pages 对公开站点有带宽与站点大小软限制（约 1GB 站点、100GB/月），
  正常小规模游玩远达不到；不要在 Pages 上额外放发布包/大文件。

### 4.4 联机模式：https 页面不能连 ws/http（混合内容）

- GitHub Pages 站点是 `https`。浏览器会拦截 https 页面发起的 `ws://` 与 `http://`
  连接（mixed content），因此：
  - ❌ 在 Pages 的联机大厅填 `http://<服务器IP>:8787` 通常会被浏览器拦截；
  - ✅ 让游戏服务器也走 **https/wss**（nginx/caddy 反代 + 证书，见
    [DEPLOY.md](DEPLOY.md) 第 8 节），联机大厅填 `https://<你的域名>`；
  - ✅ 服务器需允许 Pages 域名的跨源连接：启动时设置
    `CORS_ORIGIN=https://<owner>.github.io`（逗号分隔可多个）；
  - ⚠️ 若只为局域网测试，可用开发机 `pnpm dev`（http://<局域网IP>:5173）访问，
    而不是走 Pages 站点。
- Socket.IO 客户端会按 `服务器地址` 自动推导同协议连接；地址里不要带路径。

### 4.5 前后端分离部署时的服务端配置

| 项 | 建议 |
|----|------|
| 反代 | nginx/caddy 同域名同时反代 HTTP 与 WebSocket（`Upgrade`/`Connection` 头） |
| `CORS_ORIGIN` | `https://<owner>.github.io`（Pages 站点域名；多个用逗号分隔） |
| `TRUST_PROXY` | 仅在可信反代后置 `1`；直连暴露必须保持空（防伪造 XFF 绕过限流） |
| 防火墙 | 只放行 80/443；游戏端口可 `HOST=127.0.0.1` 只走反代 |

### 4.6 不要在前端塞任何密钥

- Pages 产物是公开的：任何写进前端代码/环境变量的密钥都视为已公开；
- 服务端密钥只配在服务器环境变量里；workflow 若需要 secret，用
  `Settings → Secrets and variables → Actions`，且不要打进前端产物。

### 4.7 自定义域名（可选）

- `Settings → Pages → Custom domain` 填写域名并按提示配置 DNS
  （A 记录到 GitHub Pages IP，或 CNAME 到 `<owner>.github.io`）；
- 启用自定义域名后，项目站点通常从 `https://<owner>.github.io/<repo>/`
  变为 `https://<你的域名>/`；`base: './'` 相对路径两种形态都兼容。

## 5. 常见问题

| 现象 | 处理 |
|------|------|
| 打开是 404 页面 | 等 1~3 分钟再刷新；检查 Pages Source 是否选了 GitHub Actions；确认 workflow 部署成功（Actions 页面绿色） |
| 能打开大厅，但进《鳄龙咆哮》黑屏 | 打开 DevTools Console/Network：看 `hero-*.glb` 等资源是否 404（多半是 `base` 被改）；确认 `base: './'` 后重新构建推送 |
| 联机大厅显示无法连接 | 先确认填的是 `https://` 域名且服务器在运行；再查服务器日志与 `CORS_ORIGIN`；用 https 页连 ws/http 会被浏览器拦截，属预期 |
| 手动 workflow 按钮灰/不可用 | 检查 `.github/workflows/pages.yml` 是否在 `main` 分支、Actions 是否启用、Pages Source 是否 GitHub Actions |
| 想先本地全流程验证再推 | `pnpm test && pnpm typecheck && pnpm build`，再按上文「本地模拟子路径验证」跑一遍 |
