import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // 后端目录和生成素材会频繁变动，别让 vite 去 watch，否则 Windows 上容易 EBUSY 崩溃
    watch: {
      ignored: [
        /\.tmpdir/,
        '**/server/**',
        '**/data/**',
        '**/shots/**',
        '**/scripts/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/assets': 'http://127.0.0.1:8787',
    },
  },
})
