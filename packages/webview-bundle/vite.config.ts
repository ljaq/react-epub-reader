import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

/** 构建后将 docs/ 复制到 dist/docs（含 PROTOCOL.md、examples/），便于 App / AI 随包读取 */
function copyDocsToDist(): import('vite').Plugin {
  return {
    name: 'copy-docs-to-dist',
    closeBundle() {
      cpSync(resolve(rootDir, 'docs'), resolve(rootDir, 'dist/docs'), { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), copyDocsToDist()],
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
