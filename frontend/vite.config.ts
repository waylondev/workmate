import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 开发期把 AG-UI 端点代理到后端，前端只认同源路径 /agui，避免 CORS 与硬编码端口
    proxy: {
      '/agui': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
