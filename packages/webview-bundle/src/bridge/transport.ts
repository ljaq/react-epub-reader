/**
 * WebView → Native 传输层 — 自动探测 RN / Flutter 平台 API
 */

export function sendToNative(raw: string): void {
  if (typeof window === 'undefined') return

  const w = window

  if (w.ReactNativeWebView?.postMessage) {
    w.ReactNativeWebView.postMessage(raw)
    return
  }

  if (w.flutter_inappwebview?.callHandler) {
    void w.flutter_inappwebview.callHandler('EpubReaderBridge', raw)
    return
  }

  if (w.EpubReaderBridge?.postMessage) {
    w.EpubReaderBridge.postMessage(raw)
    return
  }

  // h5-demo iframe 模拟：WebView 在子 frame，Native 在 parent
  try {
    const parent = w.parent
    if (parent && parent !== w && parent.EpubReaderBridge?.postMessage) {
      parent.EpubReaderBridge.postMessage(raw)
      return
    }
  } catch {
    // cross-origin parent access blocked
  }

  // 浏览器调试 fallback
  // eslint-disable-next-line no-console
  console.debug('[EpubReader] → native (no bridge)', raw)
}
