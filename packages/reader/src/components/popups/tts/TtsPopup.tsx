/**
 * TTS 主面板 — 对照 old-vue-reader/components/TtsPopup/index.vue。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookMeta, ChapterMeta } from '../../../types'
import { useTtsStore } from '../../../store/tts-store'
import { useUiStore } from '../../../store/ui-store'
import { TtsSpeedPopup } from './TtsSpeedPopup'
import { TtsTimeoutPopup } from './TtsTimeoutPopup'
import { TtsVoicePopup } from './TtsVoicePopup'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ICON_SEEK_BACK,
  ICON_SEEK_FORWARD,
  NextChapterIcon,
  PauseControlIcon,
  PlayControlIcon,
  PlayLoadingIcon,
  PrevChapterIcon,
  formatBookTitle,
  formatTtsDisplayTime
} from './tts-shared'
import './tts-popup.css'

export interface TtsPopupProps {
  bookMeta: BookMeta
  chapterList: ChapterMeta[]
  onStartPlayback: () => Promise<boolean>
  onSeekBackward: () => void
  onSeekForward: () => void
  onPrevChapter: () => void
  onNextChapter: () => void
  onOpenCatalog: () => void
}

export function TtsPopup(props: TtsPopupProps): React.ReactNode {
  const {
    bookMeta,
    chapterList,
    onStartPlayback,
    onSeekBackward,
    onSeekForward,
    onPrevChapter,
    onNextChapter,
    onOpenCatalog
  } = props

  const visible = useUiStore((s) => s.popups.tts)
  const closePopup = useUiStore((s) => s.closePopup)

  const playing = useTtsStore((s) => s.playing)
  const loading = useTtsStore((s) => s.loading)
  const speed = useTtsStore((s) => s.speed)
  const chapterId = useTtsStore((s) => s.chapterId)
  const ttsCurrentPlayTime = useTtsStore((s) => s.ttsCurrentPlayTime)
  const chapterDurationMs = useTtsStore((s) => s.chapterDurationMs)
  const getVoiceLabel = useTtsStore((s) => s.getVoiceLabel)
  const getTimeoutLabel = useTtsStore((s) => s.getTtsTimeoutRemainingFormatted)
  const timeoutMode = useTtsStore((s) => s.timeoutMode)
  const toggleTtsPlaying = useTtsStore((s) => s.toggleTtsPlaying)
  const engine = useTtsStore((s) => s.engine)

  const [showSpeed, setShowSpeed] = useState(false)
  const [showTimeout, setShowTimeout] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const [thumbWidth, setThumbWidth] = useState(0)

  const totalChapters = chapterList.length
  const canPrevChapter = Boolean(chapterId && chapterId > 1)
  const canNextChapter = Boolean(chapterId && (totalChapters <= 0 || chapterId < totalChapters))

  const currentTime = (ttsCurrentPlayTime || 0) / 1000
  const duration = (chapterDurationMs || 0) / 1000
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0

  const thumbLeft = useMemo(() => {
    const w = trackWidth - thumbWidth
    return w <= 0 ? 0 : progress * w
  }, [trackWidth, thumbWidth, progress])

  const activeBarWidth = thumbLeft + thumbWidth / 2

  const displayCurrentTimeFormatted = formatTtsDisplayTime(currentTime)
  const displayTotalTimeFormatted = formatTtsDisplayTime(duration)
  const displayTitle = formatBookTitle(bookMeta.bookName)

  const speedLabel = speed === 1 ? '1倍' : `${speed}倍`

  const timeoutButtonLabel = useMemo(() => {
    if (timeoutMode === 'off') return '定时播放'
    const remain = getTimeoutLabel()
    return remain ? `${remain}后关闭` : '定时播放'
  }, [timeoutMode, getTimeoutLabel])

  const measure = useCallback(() => {
    if (trackRef.current) setTrackWidth(trackRef.current.getBoundingClientRect().width)
    if (thumbRef.current) setThumbWidth(thumbRef.current.getBoundingClientRect().width)
  }, [])

  useEffect(() => {
    if (!visible) return
    setShowSpeed(false)
    setShowTimeout(false)
    setShowVoice(false)
    requestAnimationFrame(measure)
  }, [visible, measure])

  useEffect(() => {
    if (!visible) return
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [visible, measure])

  const handleClose = () => closePopup('tts')
  const handleReadOriginal = () => closePopup('tts')

  const togglePlay = async () => {
    if (engine?.audioPlayer?.src) {
      toggleTtsPlaying()
      return
    }
    await onStartPlayback()
  }

  if (!visible) return null

  return (
    <>
      <div className="tts-popup-mask" onClick={handleClose}>
        <div className="tts-popup-root" onClick={(e) => e.stopPropagation()}>
          <div className="tts-popup">
            <div className="tts-popup__header">
              <button type="button" className="tts-popup__close" aria-label="关闭" onClick={handleClose}>
                <span className="tts-popup__close-icon"><ChevronDownIcon /></span>
              </button>
              <span className="tts-popup__title">语音朗读</span>
            </div>

            <div className="tts-popup__book">
              <div className="tts-popup__cover-wrapper">
                {bookMeta.bookPic ? (
                  <img className="tts-popup__cover" src={bookMeta.bookPic} alt="" />
                ) : (
                  <div className="tts-popup__cover tts-popup__cover--placeholder" />
                )}
              </div>
              <div className="tts-popup__book-title">{displayTitle}</div>
            </div>

            <div className="tts-popup__nav">
              <button type="button" className="tts-popup__nav-link" onClick={handleReadOriginal}>
                阅读原文
                <ChevronRightIcon />
              </button>
              <button type="button" className="tts-popup__nav-link" onClick={onOpenCatalog}>
                目录 共{totalChapters}章
                <ChevronRightIcon />
              </button>
            </div>

            <div className="tts-popup__player">
              <div className="track-wrapper">
                <div ref={trackRef} className="progress-track">
                  <div className="progress-active" style={{ width: `${activeBarWidth}px` }} />
                  <div ref={thumbRef} className="progress-thumb" style={{ left: `${thumbLeft}px` }}>
                    {displayCurrentTimeFormatted}/{displayTotalTimeFormatted}
                  </div>
                </div>
              </div>

              <div className="control-box">
                <button type="button" className="control-box-item" aria-label="后退15秒" onClick={onSeekBackward}>
                  <img src={ICON_SEEK_BACK} alt="" />
                </button>
                <button
                  type="button"
                  className="control-box-item"
                  disabled={!canPrevChapter}
                  aria-label="上一章"
                  onClick={onPrevChapter}
                >
                  <PrevChapterIcon />
                </button>
                <button
                  type="button"
                  className={`control-box-item play-pause${loading ? ' play-pause--loading' : ''}`}
                  aria-label="播放暂停"
                  onClick={() => void togglePlay()}
                >
                  {loading ? <PlayLoadingIcon className="play-pause__loading" /> : null}
                  {!loading && playing ? <PauseControlIcon /> : null}
                  {!loading && !playing ? <PlayControlIcon /> : null}
                </button>
                <button
                  type="button"
                  className="control-box-item"
                  disabled={!canNextChapter}
                  aria-label="下一章"
                  onClick={onNextChapter}
                >
                  <NextChapterIcon />
                </button>
                <button type="button" className="control-box-item" aria-label="前进15秒" onClick={onSeekForward}>
                  <img src={ICON_SEEK_FORWARD} alt="" />
                </button>
              </div>
            </div>

            <div className="tts-popup__bottom">
              <button type="button" className="tts-popup__bottom-btn" onClick={() => setShowSpeed(true)}>
                <span>倍速: {speedLabel}</span>
                <ChevronRightIcon opacity={1} />
              </button>
              <button type="button" className="tts-popup__bottom-btn" onClick={() => setShowTimeout(true)}>
                <span>{timeoutButtonLabel}</span>
                <ChevronRightIcon opacity={1} />
              </button>
              <button type="button" className="tts-popup__bottom-btn" onClick={() => setShowVoice(true)}>
                <span>{getVoiceLabel()}</span>
                <ChevronRightIcon opacity={1} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <TtsSpeedPopup visible={showSpeed} onClose={() => setShowSpeed(false)} />
      <TtsTimeoutPopup visible={showTimeout} onClose={() => setShowTimeout(false)} />
      <TtsVoicePopup visible={showVoice} onClose={() => setShowVoice(false)} />
    </>
  )
}
