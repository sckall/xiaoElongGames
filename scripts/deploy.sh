#!/usr/bin/env bash
# ============================================================
# 部署到腾讯云服务器（rsync 上传 + docker compose 重建）
#
# 前置条件：
#   1. 服务器已安装 Docker + Docker Compose
#   2. 本机已配置 SSH 免密登录（或使用 ssh-agent）
#   3. cp .env.example .env.deploy 并填写 TM_HOST/TM_USER/TM_PATH
#
# 用法：./scripts/deploy.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.deploy ]; then
  echo "❌ 缺少 .env.deploy，请先执行：cp .env.example .env.deploy 并填写服务器信息"
  exit 1
fi

# shellcheck disable=SC1091
source .env.deploy

: "${TM_HOST:?请在 .env.deploy 中填写 TM_HOST}"
: "${TM_USER:?请在 .env.deploy 中填写 TM_USER}"
: "${TM_PATH:?请在 .env.deploy 中填写 TM_PATH}"

echo "📦 上传代码到 ${TM_USER}@${TM_HOST}:${TM_PATH} ..."
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude tools \
  --exclude .dsh \
  --exclude .env \
  --exclude .env.deploy \
  ./ "${TM_USER}@${TM_HOST}:${TM_PATH}/"

echo "🔨 在服务器上构建并启动容器 ..."
ssh "${TM_USER}@${TM_HOST}" "cd ${TM_PATH} && docker compose up -d --build"

echo "✅ 部署完成。请确认服务器防火墙已放行端口 ${TM_PORT:-8080}"
echo "   访问：http://${TM_HOST}:${TM_PORT:-8080}"
