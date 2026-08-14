# 腾讯云部署指南

《出包魔法师》联机版是**单进程服务**：Socket.IO 对战 + 静态托管前端，一个端口搞定。
下面按你的服务器形态选择方案（推荐方案 A）。

## 0. 端口与防火墙（三种方案通用）

- 腾讯云轻量应用服务器：控制台 → **防火墙** → 添加规则，放行 TCP `8080`（或你选的端口）。
- 腾讯云 CVM：控制台 → **安全组** → 入站规则，放行同样端口。

> 建议在控制台先放行端口，再启动服务，避免「部署成功但访问不了」。

## 方案 A：Docker Compose（推荐）

适合轻量服务器/CVM，环境隔离、升级方便。

```bash
# 1. 安装 Docker（腾讯云镜像加速可选）
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# 2. 上传代码（本机执行，二选一）
git clone <你的仓库地址> ~/troublemagician
# 或者用附带的部署脚本：
#   cp .env.example .env.deploy  # 填写 TM_HOST/TM_USER/TM_PATH
#   ./scripts/deploy.sh

# 3. 服务器上构建并启动
cd ~/troublemagician
docker compose up -d --build

# 4. 验证
curl http://127.0.0.1:8080/healthz   # 应返回 {"ok":true,...}
```

更新版本：`git pull && docker compose up -d --build`。
查看日志：`docker compose logs -f`。

## 方案 B：裸机 Node（小内存服务器，不跑 Docker）

```bash
# 1. 安装 Node 22+ 与 pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
sudo corepack enable && corepack prepare pnpm@11.7.0 --activate

# 2. 上传代码（同方案 A 第 2 步）

# 3. 安装依赖并构建前端
cd ~/troublemagician
pnpm install --frozen-lockfile
pnpm --filter @tm/web build

# 4. systemd 托管
sudo cp docs/tm-server.service /etc/systemd/system/
sudo nano /etc/systemd/system/tm-server.service   # 修改 User/WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now tm-server

# 5. 验证
curl http://127.0.0.1:8787/healthz
journalctl -u tm-server -f   # 看日志
```

## 方案 C：域名 + HTTPS（可选）

1. 域名解析 A 记录 → 服务器公网 IP。
2. 服务器安装 nginx：`sudo apt install -y nginx`。
3. 复制 `docs/nginx.conf` 到 `/etc/nginx/sites-available/tm`，改域名和端口，软链到 `sites-enabled`。
4. `sudo nginx -t && sudo systemctl reload nginx`。
5. 免费证书（Let's Encrypt）：`sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d 你的域名`。
6. 防火墙放行 80/443；对局服务只监听本机端口即可。

## 常见问题

| 现象 | 处理 |
|------|------|
| 部署成功但外网访问不了 | 检查控制台防火墙/安全组是否放行端口 |
| 小内存服务器构建时 OOM | `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`（持久化写入 /etc/fstab） |
| WebSocket 连接失败（nginx 场景） | 确认 nginx 配置含 `Upgrade`/`Connection` 两条头 |
| 端口被占用 | `lsof -i :8787` 找到进程处理 |
| 想换端口 | 改 `PORT` 环境变量（docker-compose.yml / systemd unit / 启动命令）并同步防火墙 |

## 架构说明

```
浏览器 ── HTTPS/WSS ──> nginx(可选) ──> Node 服务（单进程）
                                          ├─ Socket.IO 房间（对局状态权威在服务端）
                                          ├─ 断线/离开座位自动 AI 托管
                                          └─ 静态托管 apps/web/dist
```

- 无数据库、无状态持久化（对局即开即散），可随意重启、水平扩展时用 nginx 粘性会话即可。
- 房间空闲自动回收；服务端内存占用很小（每个对局一个纯 TS 引擎实例）。
