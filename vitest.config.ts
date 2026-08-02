import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['packages/**/src/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
