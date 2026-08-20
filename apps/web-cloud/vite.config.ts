import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 端口可通过环境变量覆盖；默认 5173（前端）/ 8787（服务端）。
// 用法：TM_WEB_PORT=5174 TM_SERVER_PORT=8789 pnpm dev
const WEB_PORT = Number(process.env.TM_WEB_PORT ?? 5173);
const SERVER_PORT = Number(process.env.TM_SERVER_PORT ?? 8787);

export default defineConfig({
  // 相对路径产物：可部署到任意子路径（如 GitHub Pages 的 /<repo>/），
  // 也兼容本地包在根路径托管；单人 vs AI 模式因此可纯静态托管。
  base: './',
  plugins: [react()],
  server: {
    port: WEB_PORT,
    strictPort: false, // 端口被占时自动 +1，避免 dev 启动失败
    // 局域网设备可访问（手机/其他电脑联机测试）
    host: true,
    proxy: {
      // 联机：开发时把 Socket.IO 转发到本地服务端
      '/socket.io': {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
