/**
 * TTS 音色选择弹窗。
 */
import { useTtsStore } from '../../../store/tts-store'
import { ChevronDownIcon } from './tts-shared'
import { BottomSheet } from '../../BottomSheet/BottomSheet'
import './tts-voice-popup.css'

export interface TtsVoicePopupProps {
  visible: boolean
  onClose: () => void
}

export function TtsVoicePopup(props: TtsVoicePopupProps): React.ReactNode {
  const { visible, onClose } = props
  const voiceType = useTtsStore((s) => s.voiceType)
  const voiceTypes = useTtsStore((s) => s.voiceTypes)
  const setTtsVoiceType = useTtsStore((s) => s.setTtsVoiceType)

  const handleSelect = (key: string) => {
    if (key === voiceType) {
      onClose()
      return
    }
    setTtsVoiceType(key)
    onClose()
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} height="auto" zIndex={10002}>
      <div className="voice-popup">
        <div className="voice-popup-header">
          <button type="button" className="voice-popup-close" aria-label="关闭" onClick={onClose}>
            <span className="voice-popup-close-icon"><ChevronDownIcon /></span>
          </button>
          <span>音色</span>
        </div>
        <div className="voice-options">
          {voiceTypes.map((voice) => (
            <button
              key={voice.key}
              type="button"
              className={`voice-option${voice.key === voiceType ? ' active' : ''}`}
              onClick={() => handleSelect(voice.key)}
            >
              {voice.label}
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
