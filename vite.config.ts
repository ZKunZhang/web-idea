import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // GitHub Pages 项目站点通常位于 /<repo>/ 下，相对路径可同时兼容本地预览和子路径部署。
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  worker: { format: 'es' },
}));
