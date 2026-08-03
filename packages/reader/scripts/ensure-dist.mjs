/**
 * GitHub / npm 安装后若尚无 dist，则自动 build。
 * 本地已有产物时跳过，避免每次 pnpm install 都全量编译。
 */
import { access } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(root, '..')
const marker = join(pkgRoot, 'dist', 'index.js')

try {
  await access(marker)
  process.exit(0)
} catch {
  // continue to build
}

const result = spawnSync('pnpm', ['run', 'build'], {
  cwd: pkgRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
