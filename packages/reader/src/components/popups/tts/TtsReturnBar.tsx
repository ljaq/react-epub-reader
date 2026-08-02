/**
 * TTS 返回播放位置栏。
 */
import { useTtsStore } from '../../../store/tts-store'
import { useUiStore } from '../../../store/ui-store'
import './tts-return-bar.css'

export interface TtsReturnBarProps {
  onReturn: () => void
}

function ReturnIcon() {
  return (
    <svg className="tts-return-bar__icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2L10 6L6 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TtsReturnBar(props: TtsReturnBarProps): React.ReactNode {
  const { onReturn } = props

  const sessionActive = useTtsStore((s) => s.sessionActive)
  const ttsCurrentDomPos = useTtsStore((s) => s.ttsCurrentDomPos)
  const segmentInView = useTtsStore((s) => s.segmentInView)
  const ttsPopupOpen = useUiStore((s) => s.popups.tts)
  const catalogOpen = useUiStore((s) => s.popups.catalog)
  const catalogSource = useUiStore((s) => s.catalogSource)

  const hideForCatalog = catalogOpen && catalogSource === 'tts'
  const visible = sessionActive && Boolean(ttsCurrentDomPos) && !segmentInView && !ttsPopupOpen && !hideForCatalog

  if (!visible) return null

  return (
    <button type="button" className="tts-return-bar" onClick={onReturn} aria-label="返回当前播放位置">
      <span className="tts-return-bar__text">返回当前播放位置</span>
      <ReturnIcon />
    </button>
  )
}
