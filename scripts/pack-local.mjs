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

// 3. 启动脚本（macOS 双击 / Windows 双击）
fs.writeFileSync(
  path.join(pkgDir, '启动.command'),
  `#!/bin/bash
# 小鳄龙之家 · 单机版启动器（macOS 双击运行；首次需右键→打开 或在终端 chmod +x）
cd "$(dirname "$0")"
PORT=8123
if ! lsof -i :$PORT >/dev/null 2>&1; then
  (python3 -m http.server $PORT >/dev/null 2>&1 &)
fi
sleep 1
open "http://127.0.0.1:$PORT"
`,
);
fs.writeFileSync(
  path.join(pkgDir, '启动.bat'),
  `@echo off\r\ncd /d "%%~dp0"\r\nwhere python >nul 2>&1\r\nif %%errorlevel%% neq 0 (\r\n  echo [小鳄龙之家] 未检测到 Python，单机启动需要它：\r\n  echo   方法1（推荐）：winget install Python.Python.3.12\r\n  echo   方法2：浏览器打开 https://www.python.org/downloads/ 安装，勾选 "Add Python to PATH"\r\n  echo   装好后重新双击本脚本\r\n  pause\r\n  exit /b 1\r\n)\r\nstart "" cmd /c "python -m http.server 8123 >nul 2>&1"\r\ntimeout /t 1 /nobreak >nul\r\nstart http://127.0.0.1:8123\r\n`,
);
fs.writeFileSync(
  path.join(pkgDir, '使用说明.txt'),
  `小鳄龙之家 · 单机版 v${version}

【怎么玩】
- macOS：双击「启动.command」（如被拦截：右键→打开；或首次在终端执行 chmod +x 启动.command）
- Windows：双击「启动.bat」，浏览器自动打开 http://127.0.0.1:8123

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
