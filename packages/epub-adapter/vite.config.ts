import { defineConfig } from 'vite'
import { resolve } from 'node:path'

function isExternal(id: string): boolean {
  return (
    id === 'epubjs' ||
    id.startsWith('epubjs/') ||
    id === '@react-epub-reader/reader' ||
    id.startsWith('@react-epub-reader/reader/')
  )
}

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'ReactEpubAdapter',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: isExternal,
    },
    minify: true,
    sourcemap: false,
    emptyOutDir: true,
    reportCompressedSize: true,
  },
})
