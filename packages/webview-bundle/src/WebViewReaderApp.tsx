import { useEffect, useRef, useState } from 'react'
import type { EpubAdapter } from '@react-epub-reader/epub-adapter'
import { setCommandHandler } from './bridge/dispatch'
import { handleBridgeCommand, type CommandContext } from './host/command-handler'
import { WebViewReaderHost } from './host/WebViewReaderHost'
import { createEmptyHostState, type WebViewHostState } from './host/webview-host-store'

export function WebViewReaderApp() {
  const [state, setState] = useState<WebViewHostState>(() => createEmptyHostState())
  const stateRef = useRef(state)
  stateRef.current = state

  const adapterRef = useRef<EpubAdapter | null>(null)
  const epubChunkBuffer = useRef<Map<number, string[]>>(new Map())

  const commandCtxRef = useRef<CommandContext>({
    setState,
    getState: () => stateRef.current,
    adapterRef,
    epubChunkBuffer,
  })

  useEffect(() => {
    const ctx = commandCtxRef.current
    setCommandHandler((msg) => handleBridgeCommand(msg, ctx))
    return () => {
      setCommandHandler(null)
      adapterRef.current?.destroy?.()
      adapterRef.current = null
    }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <WebViewReaderHost state={state} commandCtx={commandCtxRef.current} />
    </div>
  )
}
