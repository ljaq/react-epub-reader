import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { INBOUND_TYPES, OUTBOUND_TYPES } from '@react-epub-reader/webview-bundle'
import { resolveScope } from '../../storage/annotation-storage'
import { buildApiLoadBookPayload, SAMPLE_BOOK_ID } from './api-bootstrap'
import { buildEpubLoadPayload, EPUB_BOOK_ID } from './epub-bootstrap'
import {
  handleBridgeMessage,
  resetBridgeChapterCache,
  seedInjectedChapters,
  type BridgeHandlerContext,
} from './bridge-handler'
import { getWebViewIframeUrl } from './webview-frame-url'

export interface MockNativeAppProps {
  dataSource: 'api' | 'epub'
  epubSourceUrl?: string | null
  epubFileName?: string
  onNavigate?: (path: string) => void
}

export function MockNativeApp({
  dataSource,
  epubSourceUrl,
  epubFileName,
  onNavigate,
}: MockNativeAppProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const ctxRef = useRef<BridgeHandlerContext | null>(null)

  const [status, setStatus] = useState<'idle' | 'booting' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState(0)
  const [bridgeReady, setBridgeReady] = useState(false)

  const bookId = dataSource === 'api' ? SAMPLE_BOOK_ID : EPUB_BOOK_ID
  const scope = resolveScope(
    dataSource === 'api'
      ? { mode: 'webview-api', bookId }
      : {
          mode: 'webview-epub',
          epubSource: epubFileName != null ? { fileName: epubFileName } : 'sample',
        },
  )

  const canRenderWebView = dataSource === 'api' || Boolean(epubSourceUrl)
  const iframeUrl = getWebViewIframeUrl()

  const dispatchToIframe = useCallback((type: string, payload?: unknown) => {
    const win = iframeRef.current?.contentWindow as
      | (Window & { __EpubReader?: { dispatch: (raw: string) => void } })
      | null
    win?.__EpubReader?.dispatch(JSON.stringify({ v: 1, type, payload }))
  }, [])

  const runBootstrap = useCallback(async () => {
    if (!canRenderWebView || !bridgeReady) return

    setStatus('booting')
    setError(null)
    resetBridgeChapterCache()

    try {
      if (dataSource === 'api') {
        const payload = await buildApiLoadBookPayload(bookId)
        seedInjectedChapters(
          bookId,
          Object.keys(payload.chapters).map((id) => Number(id)),
        )
        dispatchToIframe(INBOUND_TYPES.loadBook, payload)
      } else if (epubSourceUrl) {
        dispatchToIframe(INBOUND_TYPES.loadEpub, buildEpubLoadPayload(epubSourceUrl))
      }
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [bookId, bridgeReady, canRenderWebView, dataSource, dispatchToIframe, epubSourceUrl])

  useEffect(() => {
    ctxRef.current = {
      dataSource,
      bookId,
      scope,
      dispatch: dispatchToIframe,
      onNavigate,
    }
  }, [bookId, dataSource, dispatchToIframe, onNavigate, scope])

  const markBridgeReady = useCallback(() => {
    setBridgeReady(true)
  }, [])

  // 必须在 iframe 加载前注册，避免子页 installBridge 发出的 bridgeReady 被错过
  useLayoutEffect(() => {
    window.EpubReaderBridge = {
      postMessage(raw: string) {
        try {
          const msg = JSON.parse(raw) as { type?: string }
          if (msg.type === OUTBOUND_TYPES.bridgeReady) {
            markBridgeReady()
          }
        } catch {
          // ignore malformed bridge messages
        }

        const ctx = ctxRef.current
        if (!ctx) return
        handleBridgeMessage(raw, ctx)
      },
    }

    return () => {
      delete window.EpubReaderBridge
    }
  }, [markBridgeReady])

  const pollTimerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)

  const handleIframeLoad = useCallback(() => {
    if (pollTimerRef.current !== undefined) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = undefined
    }

    let attempts = 0
    const maxAttempts = 200 // ~10s，等 ES module 执行完 installBridge

    const poll = () => {
      const win = iframeRef.current?.contentWindow as
        | (Window & { __EpubReader?: { dispatch: (raw: string) => void } })
        | null

      if (win?.__EpubReader) {
        markBridgeReady()
        return
      }

      attempts += 1
      if (attempts < maxAttempts) {
        pollTimerRef.current = window.setTimeout(poll, 50)
        return
      }

      setStatus('error')
      setError(
        `iframe 未加载 webview-bundle（期望 ${iframeUrl}）。请确认根目录 pnpm dev 已同时启动 :5173 与 :5174，并刷新重试。`,
      )
    }

    poll()
  }, [iframeUrl, markBridgeReady])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== undefined) {
        window.clearTimeout(pollTimerRef.current)
      }
    }
  }, [session])

  useEffect(() => {
    if (!canRenderWebView) {
      setStatus('idle')
      setBridgeReady(false)
      return
    }

    setBridgeReady(false)
    setSession((prev) => prev + 1)
  }, [canRenderWebView, dataSource, epubSourceUrl])

  useEffect(() => {
    if (!bridgeReady || session === 0) return
    void runBootstrap()
  }, [bridgeReady, runBootstrap, session])

  useEffect(() => {
    return () => {
      dispatchToIframe(INBOUND_TYPES.destroy)
    }
  }, [dispatchToIframe])

  return (
    <div data-webview-sim="true" data-webview-mode={dataSource} style={shellStyle}>
      <div data-mock-native-shell="true" style={phoneFrameStyle}>
        <div style={phoneHeaderStyle}>
          <div style={headerRowStyle}>
            <span style={{ fontSize: 12, color: '#666' }}>
              Mock Native App · {dataSource === 'api' ? 'API 模式' : 'EPUB 模式'}
            </span>
            {status === 'booting' && <span style={{ fontSize: 11, color: '#999' }}>加载中…</span>}
            {status === 'error' && (
              <button type="button" onClick={() => void runBootstrap()} style={retryBtnStyle}>
                重试
              </button>
            )}
          </div>
          <span style={{ fontSize: 10, color: '#aaa' }}>iframe → {iframeUrl}</span>
        </div>
        <div data-webview-container="true" style={webviewStyle}>
          {status === 'error' ? (
            <div style={errorStyle}>
              <p>加载失败：{error}</p>
              <button type="button" onClick={() => void runBootstrap()}>
                重试
              </button>
            </div>
          ) : !canRenderWebView ? (
            <div style={errorStyle}>
              <p>请选择本地 .epub 文件</p>
            </div>
          ) : (
            <iframe
              key={`webview-iframe-${dataSource}-${session}`}
              ref={iframeRef}
              data-webview-iframe="true"
              title="EPUB Reader WebView"
              src={iframeUrl}
              style={iframeStyle}
              allow="clipboard-read; clipboard-write"
              onLoad={handleIframeLoad}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const shellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#f0f2f5',
  padding: 16,
}

const phoneFrameStyle: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  height: 'calc(100vh - 80px)',
  maxHeight: 860,
  background: '#fff',
  borderRadius: 24,
  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const phoneHeaderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '10px 16px',
  borderBottom: '1px solid #eee',
  flexShrink: 0,
}

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const webviewStyle: CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  position: 'relative',
  minHeight: 0,
}

const iframeStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 'none',
  display: 'block',
  background: '#f5f0e8',
}

const errorStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: 24,
  fontSize: 14,
  color: '#666',
  gap: 12,
}

const retryBtnStyle: CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  cursor: 'pointer',
}
