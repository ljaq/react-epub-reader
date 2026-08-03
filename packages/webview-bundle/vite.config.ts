import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    minify: true,
    cssMinify: true,
    sourcemap: false,
    // App 内嵌 WebView：打成单 JS，不按首屏拆包
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      output: {
        codeSplitting: false,
        // 固定文件名，方便 App 客户端引用（不带 content hash）
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5174,
    host: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
})
