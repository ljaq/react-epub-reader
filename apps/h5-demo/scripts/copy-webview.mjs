import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const webviewDist = resolve(repoRoot, 'packages/webview-bundle/dist')
const publicWebview = resolve(repoRoot, 'apps/h5-demo/public/webview')

if (!existsSync(webviewDist)) {
  console.error('[copy-webview] packages/webview-bundle/dist 不存在，请先构建 webview-bundle')
  process.exit(1)
}

mkdirSync(publicWebview, { recursive: true })
cpSync(webviewDist, publicWebview, { recursive: true })
console.log('[copy-webview] copied to apps/h5-demo/public/webview')
