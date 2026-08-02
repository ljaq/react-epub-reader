/**
 * TTS 迷你播放器 — 对照 old-vue-reader/components/TtsMiniPlayer/index.vue。
 */
import type { BookMeta } from '../../../types'
import { useTtsStore } from '../../../store/tts-store'
import { useUiStore } from '../../../store/ui-store'
import { PlayLoadingIcon } from './tts-shared'
import './tts-mini-player.css'

const RING_RADIUS = 14
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export interface TtsMiniPlayerProps {
  bookMeta: BookMeta
  onOpenPanel: () => void
  onTogglePlay: () => void
  onClose: () => void
}

function CloseIcon() {
  return (
    <svg className="tts-mini-player__close-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8.00001 7.21414L11.9284 3.28577C12.1453 3.06881 12.4971 3.06881 12.7141 3.28577C12.931 3.50272 12.931 3.85448 12.7141 4.07144L8.78568 7.99981L12.7141 11.9282C12.931 12.1451 12.931 12.4969 12.7141 12.7139C12.4971 12.9308 12.1453 12.9308 11.9284 12.7139L8.00001 8.78548L4.07164 12.7139C3.85468 12.9308 3.50292 12.9308 3.28596 12.7139C3.06901 12.4969 3.06901 12.1451 3.28596 11.9282L7.21433 7.99981L3.28596 4.07144C3.06901 3.85448 3.06901 3.50272 3.28596 3.28577C3.50292 3.06881 3.85468 3.06881 4.07164 3.28577L8.00001 7.21414Z"
        fill="white"
        fillOpacity="0.35"
      />
    </svg>
  )
}

function MiniPauseIcon() {
  return (
    <svg className="tts-mini-player__control-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M6.11111 2.5C7.33841 2.5 8.33333 3.49492 8.33333 4.72222V15.2778C8.33333 16.5051 7.33841 17.5 6.11111 17.5H4.72222C3.49492 17.5 2.5 16.5051 2.5 15.2778V4.72222C2.5 3.49492 3.49492 2.5 4.72222 2.5H6.11111ZM15.2778 2.5C16.5051 2.5 17.5 3.49492 17.5 4.72222V15.2778C17.5 16.5051 16.5051 17.5 15.2778 17.5H13.8889C12.6616 17.5 11.6667 16.5051 11.6667 15.2778V4.72222C11.6667 3.49492 12.6616 2.5 13.8889 2.5H15.2778Z"
        fill="white"
        fillOpacity="0.55"
      />
    </svg>
  )
}

function MiniPlayIcon() {
  return (
    <svg className="tts-mini-player__control-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M16.43 11.6228L8.01551 17.1764C7.11924 17.7679 5.91312 17.5209 5.32158 16.6246C5.11181 16.3068 4.99999 15.9343 4.99999 15.5535V4.4464C4.99999 3.37251 5.87055 2.50195 6.94443 2.50195C7.32525 2.50195 7.69768 2.61378 8.01551 2.82355L16.43 8.37711C17.3263 8.96866 17.5733 10.1748 16.9818 11.071C16.837 11.2904 16.6493 11.4781 16.43 11.6228Z"
        fill="white"
        fillOpacity="0.55"
      />
    </svg>
  )
}

export function TtsMiniPlayer(props: TtsMiniPlayerProps): React.ReactNode {
  const { bookMeta, onOpenPanel, onTogglePlay, onClose } = props

  const sessionActive = useTtsStore((s) => s.sessionActive)
  const ttsPopupOpen = useUiStore((s) => s.popups.tts)
  const playing = useTtsStore((s) => s.playing)
  const loading = useTtsStore((s) => s.loading)
  const ttsCurrentPlayTime = useTtsStore((s) => s.ttsCurrentPlayTime)
  const chapterDurationMs = useTtsStore((s) => s.chapterDurationMs)

  if (!sessionActive || ttsPopupOpen) return null

  const progress = chapterDurationMs > 0 ? ttsCurrentPlayTime / chapterDurationMs : 0
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, progress))

  return (
    <div className="tts-mini-player">
      <div className="tts-mini-player__pill">
        <button type="button" className="tts-mini-player__cover-btn" onClick={onOpenPanel} aria-label="打开语音朗读">
          {bookMeta.bookPic ? (
            <img
              className={`tts-mini-player__cover${playing ? '' : ' tts-mini-player__cover--paused'}`}
              src={bookMeta.bookPic}
              alt=""
            />
          ) : (
            <div className={`tts-mini-player__cover tts-mini-player__cover--placeholder${playing ? '' : ' tts-mini-player__cover--paused'}`} />
          )}
          <svg className="tts-mini-player__progress-ring" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r={RING_RADIUS} stroke="rgba(128, 128, 128, 0.50)" strokeWidth="4" />
            <circle
              cx="16"
              cy="16"
              r={RING_RADIUS}
              stroke="rgba(255, 255, 255, 0.55)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 16 16)"
            />
          </svg>
          {loading ? <PlayLoadingIcon className="tts-mini-player__loading" /> : null}
        </button>
        <button
          type="button"
          className={`tts-mini-player__control${loading ? ' tts-mini-player__control--loading' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePlay()
          }}
          aria-label="播放暂停"
        >
          {playing ? <MiniPauseIcon /> : <MiniPlayIcon />}
        </button>
        <button
          type="button"
          className="tts-mini-player__close"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label="关闭朗读"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}
