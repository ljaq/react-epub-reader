import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 启用自定义 exports condition，让本 demo 直接吃 workspace 源码；
 * 外部项目不声明该 condition，仍解析到 dist。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['@react-epub-reader/source'],
  },
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
