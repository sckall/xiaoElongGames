import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 局域网设备可访问（手机/其他电脑联机测试）
    host: true,
    proxy: {
      // 联机：开发时把 Socket.IO 转发到本地服务端
      '/socket.io': {
        target: 'http://127.0.0.1:8787',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
