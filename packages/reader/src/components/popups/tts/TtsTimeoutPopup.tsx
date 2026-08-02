/**
 * TTS 定时关闭弹窗。
 */
import { useTtsStore } from '../../../store/tts-store'
import { ChevronDownIcon } from './tts-shared'
import './tts-sub-popup.css'
import './tts-timeout-popup.css'

const TIMEOUT_OPTIONS = [
  { value: 'off' as const, label: '不开启' },
  { value: 1, label: '1分钟' },
  { value: 30, label: '30分钟' },
  { value: 60, label: '60分钟' },
  { value: 90, label: '90分钟' },
  { value: 'lecture' as const, label: '播完本讲' }
]

export interface TtsTimeoutPopupProps {
  visible: boolean
  onClose: () => void
}

export function TtsTimeoutPopup(props: TtsTimeoutPopupProps): React.ReactNode {
  const { visible, onClose } = props
  const timeoutMode = useTtsStore((s) => s.timeoutMode)
  const setTtsTimeoutMode = useTtsStore((s) => s.setTtsTimeoutMode)
  const clearTtsTimeout = useTtsStore((s) => s.clearTtsTimeout)
  const getRemaining = useTtsStore((s) => s.getTtsTimeoutRemainingFormatted)

  const isActive = (value: typeof TIMEOUT_OPTIONS[number]['value']): boolean => {
    if (value === 'off') return timeoutMode === 'off'
    if (value === 'lecture') return timeoutMode === 'end'
    return timeoutMode === value
  }

  const handleSelect = (value: typeof TIMEOUT_OPTIONS[number]['value']) => {
    if (isActive(value)) {
      clearTtsTimeout()
      return
    }
    if (value === 'off') {
      clearTtsTimeout()
      return
    }
    setTtsTimeoutMode(value)
  }

  const labelFor = (option: typeof TIMEOUT_OPTIONS[number]): string => {
    if (isActive(option.value) && (typeof option.value === 'number' || option.value === 'lecture')) {
      const remain = getRemaining()
      if (remain) return `${remain}后关闭`
    }
    return option.label
  }

  if (!visible) return null

  return (
    <div className="tts-sub-popup-overlay" onClick={onClose}>
      <div className="tts-sub-popup-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="timeout-popup">
          <div className="timeout-popup-header">
            <button type="button" className="timeout-popup-close" aria-label="关闭" onClick={onClose}>
              <span className="timeout-popup-close-icon"><ChevronDownIcon /></span>
            </button>
            <span>定时</span>
          </div>
          <div className="timeout-options">
            {TIMEOUT_OPTIONS.map((option) => (
              <button
                key={String(option.value)}
                type="button"
                className={`timeout-option${isActive(option.value) ? ' active' : ''} ${option.value}`}
                onClick={() => handleSelect(option.value)}
              >
                {labelFor(option)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
