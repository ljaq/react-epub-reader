import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  host: true,
  open: false,
  headers: {
      // 允许 EPUB 本地文件模式跨域读取
      'Access-Control-Allow-Origin': '*',
    },
  },
})
