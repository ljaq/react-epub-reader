/** iframe 加载 webview-bundle 的 URL（与 h5-demo 同源，经 vite proxy 或 public 静态资源） */
export function getWebViewIframeUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return import.meta.env.DEV ? `${prefix}webview/` : `${prefix}webview/index.html`
}
