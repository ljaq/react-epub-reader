interface ReactNativeWebViewBridge {
  postMessage: (message: string) => void
}

interface FlutterInAppWebViewBridge {
  callHandler: (handlerName: string, ...args: unknown[]) => Promise<unknown>
}

interface FlutterJsChannelBridge {
  postMessage: (message: string) => void
}

declare global {
  interface Window {
    ReactNativeWebView?: ReactNativeWebViewBridge
    flutter_inappwebview?: FlutterInAppWebViewBridge
    EpubReaderBridge?: FlutterJsChannelBridge
  }
}

export {}
