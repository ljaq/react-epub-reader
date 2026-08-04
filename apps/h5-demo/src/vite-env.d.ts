/// <reference types="vite/client" />

interface EpubReaderBridgeTransport {
  postMessage: (message: string) => void
}

declare global {
  interface Window {
    EpubReaderBridge?: EpubReaderBridgeTransport
    __EpubReader?: {
      dispatch: (raw: string) => void
      version: number
    }
  }
}

export {}
