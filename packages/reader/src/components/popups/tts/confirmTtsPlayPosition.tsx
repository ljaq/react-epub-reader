/**
 * TTS 播放位置确认 — Promise 对话框（替代 Vue TtsPlayPositionDialog/plugin）。
 *
 * 不使用 createRoot：挂在 Reader 树内（TtsPlayPositionConfirmHost），避免 library
 * 把 react-dom/client 打进产物。
 */
import { useSyncExternalStore } from 'react'
import { TtsPlayPositionDialog } from './TtsPlayPositionDialog'

export type PlayPositionChoice = true | false | null

export type ConfirmTtsPlayPositionOptions = {
  message?: string
  confirmText?: string
  cancelText?: string
}

type DialogState = ConfirmTtsPlayPositionOptions & {
  visible: boolean
}

const EMPTY: DialogState = { visible: false }

let dialogState: DialogState = EMPTY
let resolver: ((choice: PlayPositionChoice) => void) | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): DialogState {
  return dialogState
}

function finish(choice: PlayPositionChoice): void {
  dialogState = EMPTY
  emit()
  const resolve = resolver
  resolver = null
  resolve?.(choice)
}

export function confirmTtsPlayPosition(
  options?: ConfirmTtsPlayPositionOptions
): Promise<PlayPositionChoice> {
  if (resolver) {
    resolver(null)
    resolver = null
  }

  dialogState = {
    visible: true,
    message: options?.message,
    confirmText: options?.confirmText,
    cancelText: options?.cancelText
  }
  emit()

  return new Promise((resolve) => {
    resolver = resolve
  })
}

/** 挂在 Reader / TtsLayer 内，承接 confirmTtsPlayPosition 的 UI */
export function TtsPlayPositionConfirmHost(): React.ReactNode {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return (
    <TtsPlayPositionDialog
      visible={state.visible}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
      onClose={() => finish(null)}
    />
  )
}
