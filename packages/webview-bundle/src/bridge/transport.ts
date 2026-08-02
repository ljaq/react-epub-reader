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

  // 浏览器调试 fallback
  // eslint-disable-next-line no-console
  console.debug('[EpubReader] → native (no bridge)', raw)
}
