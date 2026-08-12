import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 后端目标地址：可用环境变量 VITE_API_TARGET 覆盖（默认 4000）
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:4000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': './src',
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiTarget,
        ws: true,
      },
    },
  },
})
