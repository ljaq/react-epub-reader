import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/** Peer / shared deps must stay external — including subpath imports. */
function isExternal(id: string): boolean {
  return (
    id === 'react' ||
    id === 'react-dom' ||
    id === 'zustand' ||
    id.startsWith('react/') ||
    id.startsWith('react-dom/') ||
    id.startsWith('zustand/')
  )
}

// Library mode：产出 dist JS/CSS；类型由 tsc -p tsconfig.build.json 生成
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'ReactEpubReader',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: isExternal,
    },
    minify: true,
    cssMinify: true,
    sourcemap: false,
    emptyOutDir: true,
    reportCompressedSize: true,
  },
})
