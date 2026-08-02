import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'ReactEpubAdapter',
      fileName: 'epub-adapter',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['epubjs', '@react-epub-reader/reader'],
    },
    emptyOutDir: true,
  },
})
