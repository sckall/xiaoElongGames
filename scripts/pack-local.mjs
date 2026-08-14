/**
 * 单机版打包脚本：产出「双击即玩」的本地包（不需要 Node/pnpm）。
 *
 * 原理：单人 vs AI 模式的规则引擎完全在浏览器内运行，不依赖任何游戏服务端；
 * 本地包只需托管静态文件（apps/web/dist），用系统自带的 python 起一个
 * 仅本机可访问的极轻静态服务器（127.0.0.1:8123），双击启动脚本即可打开。
 * 联机模式在单机包中也可用：在联机大厅「服务器地址」填入已部署的公网服务器即可。
 *
 * 用法：node scripts/pack-local.mjs
 * 产物：release/gator-hall-local-<版本>/（内含 启动.command / 启动.bat）
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const outDir = path.join(root, 'release');
const pkgDir = path.join(outDir, `gator-hall-local-${version}`);

// 1. 构建前端
console.log('🔨 构建前端……');
execSync('pnpm build', { cwd: root, stdio: 'inherit' });

// 2. 组装本地包
fs.rmSync(pkgDir, { recursive: true, force: true });
fs.mkdirSync(pkgDir, { recursive: true });
fs.cpSync(path.join(root, 'apps/web/dist'), pkgDir, { recursive: true });

// 3. 迷你静态服务器（仅监听 127.0.0.1；闲置超时自动退出；Ctrl+C/关窗口立即停）
fs.writeFileSync(
  path.join(pkgDir, 'server.py'),
  `import http.server
import socketserver
import threading
import time
import os

PORT = 8123
# 闲置多少秒后自动退出（可用环境变量覆盖，方便测试）
IDLE_LIMIT = int(os.environ.get("TM_IDLE", "600"))

last_request = time.time()

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        global last_request
        last_request = time.time()
        return super().do_GET()

    def log_message(self, *args):
        pass  # 安静模式

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

with Server(("127.0.0.1", PORT), Handler) as httpd:
    def watcher():
        while True:
            time.sleep(10)
            if time.time() - last_request > IDLE_LIMIT:
                httpd.shutdown()
                return

    threading.Thread(target=watcher, daemon=True).start()
    print(f"[Gator Hall] local server: http://127.0.0.1:{PORT}")
    print(f"[Gator Hall] auto-stops after {IDLE_LIMIT}s idle, or Ctrl+C / close this window.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
print("[Gator Hall] server stopped.")
`,
);

// 4. 启动脚本（macOS 双击 / Windows 双击）
fs.writeFileSync(
  path.join(pkgDir, '启动.command'),
  `#!/bin/bash
# 小鳄龙之家 · 单机版启动器
# 双击运行；首次如被拦截请右键→打开（或在终端执行 chmod +x 启动.command）
cd "$(dirname "$0")"
open "http://127.0.0.1:8123"
exec python3 server.py
# 玩完关掉这个终端窗口（或 Ctrl+C）即停止服务；闲置 10 分钟也会自动退出
`,
);
fs.writeFileSync(
  path.join(pkgDir, '启动.bat'),
  `@echo off\r\nchcp 65001 >nul\r\ncd /d "%%~dp0"\r\nwhere python >nul 2>&1\r\nif %%errorlevel%% neq 0 (\r\n  echo [小鳄龙之家] 未检测到 Python，单机启动需要它：\r\n  echo   方法1（推荐）：winget install Python.Python.3.12\r\n  echo   方法2：浏览器打开 https://www.python.org/downloads/ 安装，勾选 "Add Python to PATH"\r\n  echo   装好后重新双击本脚本\r\n  pause\r\n  exit /b 1\r\n)\r\nstart http://127.0.0.1:8123\r\npython server.py\r\necho [小鳄龙之家] 服务已停止（闲置自动退出或你关闭了窗口）\r\npause\r\n`,
);
fs.writeFileSync(
  path.join(pkgDir, '使用说明.txt'),
  `小鳄龙之家 · 单机版 v${version}

【怎么玩】
- macOS：双击「启动.command」（如被拦截：右键→打开；或首次在终端执行 chmod +x 启动.command）
- Windows：双击「启动.bat」，浏览器自动打开 http://127.0.0.1:8123

【服务会自动关闭，不留后台进程】
- 玩完关掉启动时弹出的那个小窗口（或按 Ctrl+C），服务立即停止
- 即使忘记关：闲置 10 分钟无操作也会自动退出
- 服务只监听本机（127.0.0.1），不对外暴露

【运行依赖】
- 现代浏览器（Chrome/Edge/Safari/Firefox 均可）
- Python3（仅用于托管本目录静态文件，不含任何游戏逻辑）：
  macOS 系统自带；Windows 需安装（启动.bat 会检测并给出安装指引）
- 不需要 Node.js / pnpm / npm，不需要联网（单人模式完全离线）

【为什么包这么小（约 0.1MB）】
前端构建时已把游戏全部代码（规则引擎、AI、界面）打包进一个 JS 文件，
运行时无任何外部依赖。

【联机】
单人 vs AI 完全本地。想联机：游戏内「联机大厅 → 服务器地址」填入
已部署的公网服务器地址（http://<IP或域名>:<端口>）即可。
`,
);

execSync(`tar -czf "${pkgDir}.tar.gz" -C "${outDir}" "gator-hall-local-${version}"`);
console.log(`✅ 单机版包已生成：${pkgDir}.tar.gz（${(fs.statSync(`${pkgDir}.tar.gz`).size / 1024 / 1024).toFixed(2)} MB）`);
console.log('   解压后双击 启动.command / 启动.bat 即可游玩，无需安装任何开发环境');
