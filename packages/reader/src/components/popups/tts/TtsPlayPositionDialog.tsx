/**
 * 离开阅读位置确认弹窗 — 对照 TtsPlayPositionDialog/index.vue。
 */
import './tts-play-position-dialog.css'

export interface TtsPlayPositionDialogProps {
  visible: boolean
  message?: string
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  onCancel?: () => void
  onClose?: () => void
}

export function TtsPlayPositionDialog(props: TtsPlayPositionDialogProps): React.ReactNode {
  const {
    visible,
    message = '当前阅读页进度与播放进度不一致，请选择播放位置！',
    confirmText = '从阅读位置播放',
    cancelText = '从播放位置播放',
    onConfirm,
    onCancel,
    onClose
  } = props

  if (!visible) return null

  return (
    <div className="tts-pos-dialog-overlay" onClick={onClose}>
      <div className="tts-pos-dialog" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tts-pos-dialog__close" aria-label="关闭" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <div className="tts-pos-dialog__body">
          <p className="tts-pos-dialog__message">{message}</p>
        </div>
        <div className="tts-pos-dialog__footer">
          <button type="button" className="tts-pos-dialog__btn tts-pos-dialog__btn--cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <span className="tts-pos-dialog__divider" />
          <button type="button" className="tts-pos-dialog__btn tts-pos-dialog__btn--confirm" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
