import { createMessage, parseMessage, type BridgeMessage } from './protocol'
import { sendToNative } from './transport'

export type CommandHandler = (msg: BridgeMessage) => void | Promise<void>

let commandHandler: CommandHandler | null = null

export function setCommandHandler(handler: CommandHandler | null): void {
  commandHandler = handler
}

export function emit<T>(type: string, payload?: T, id?: string): void {
  sendToNative(JSON.stringify(createMessage(type, payload, id)))
}

async function handleDispatch(raw: string): Promise<void> {
  const msg = parseMessage(raw)
  if (!msg) {
    emit('error', { scope: 'bridge', message: 'Invalid bridge message' })
    return
  }

  if (!commandHandler) {
    emit('error', { scope: 'bridge', message: 'Bridge not ready' })
    return
  }

  try {
    await commandHandler(msg)
  } catch (error) {
    emit('error', {
      scope: 'bridge',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export interface EpubReaderBridge {
  dispatch: (raw: string) => void
  version: number
}

declare global {
  interface Window {
    __EpubReader?: EpubReaderBridge
  }
}

export function installBridge(): void {
  window.__EpubReader = {
    version: 1,
    dispatch(raw: string) {
      void handleDispatch(raw)
    },
  }

  emit('bridgeReady', { version: 1 })
}
