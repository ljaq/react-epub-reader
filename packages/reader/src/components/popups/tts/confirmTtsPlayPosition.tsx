/**
 * TTS 播放位置确认 — Promise 对话框（替代 Vue TtsPlayPositionDialog/plugin）。
 */
import { createRoot, type Root } from 'react-dom/client'
import { TtsPlayPositionDialog } from './TtsPlayPositionDialog'

export type PlayPositionChoice = true | false | null

let dialogRoot: Root | null = null
let containerEl: HTMLDivElement | null = null

function ensureContainer(): HTMLDivElement {
  if (!containerEl) {
    containerEl = document.createElement('div')
    containerEl.id = 'tts-play-position-dialog-root'
    document.body.appendChild(containerEl)
    dialogRoot = createRoot(containerEl)
  }
  return containerEl
}

function destroyContainer(): void {
  if (dialogRoot) {
    dialogRoot.unmount()
    dialogRoot = null
  }
  if (containerEl) {
    containerEl.remove()
    containerEl = null
  }
}

export function confirmTtsPlayPosition(options?: {
  message?: string
  confirmText?: string
  cancelText?: string
}): Promise<PlayPositionChoice> {
  ensureContainer()

  return new Promise((resolve) => {
    const finish = (choice: PlayPositionChoice) => {
      destroyContainer()
      resolve(choice)
    }

    dialogRoot?.render(
      <TtsPlayPositionDialog
        visible
        message={options?.message}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
        onClose={() => finish(null)}
      />
    )
  })
}
