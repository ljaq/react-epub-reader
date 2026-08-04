import { useLayoutEffect, useRef, useState } from 'react'
import type { EpubAdapter } from '@react-epub-reader/epub-adapter'
import { emit, setCommandHandler } from './bridge/dispatch'
import { handleBridgeCommand, type CommandContext } from './host/command-handler'
import { WebViewReaderHost } from './host/WebViewReaderHost'
import { createEmptyHostState, type WebViewHostState } from './host/webview-host-store'
import { OUTBOUND_TYPES } from './bridge/protocol'

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

  useLayoutEffect(() => {
    const ctx = commandCtxRef.current
    setCommandHandler((msg) => handleBridgeCommand(msg, ctx))
    emit(OUTBOUND_TYPES.bridgeReady, { version: 1 })
    return () => {
      setCommandHandler(null)
      adapterRef.current?.destroy?.()
      adapterRef.current = null
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <WebViewReaderHost state={state} commandCtx={commandCtxRef.current} />
    </div>
  )
}
