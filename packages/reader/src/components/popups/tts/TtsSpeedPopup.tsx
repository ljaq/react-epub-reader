/**
 * TTS 倍速弹窗 — 0.5–2.1，对照 TtsSpeedPopup/index.vue。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTtsStore } from '../../../store/tts-store'
import { ChevronDownIcon } from './tts-shared'
import './tts-sub-popup.css'
import './tts-speed-popup.css'

const SPEED_MIN = 0.5
const SPEED_MAX = 2.1
const SPEED_STEP = 0.1

function buildSpeedList(): number[] {
  const list: number[] = []
  for (let v = SPEED_MIN; v <= SPEED_MAX + 0.001; v += SPEED_STEP) {
    list.push(Math.round(v * 10) / 10)
  }
  return list
}

const SPEED_LIST = buildSpeedList()
const SPEED_INDEX_MAX = SPEED_LIST.length - 1

export interface TtsSpeedPopupProps {
  visible: boolean
  onClose: () => void
}

export function TtsSpeedPopup(props: TtsSpeedPopupProps): React.ReactNode {
  const { visible, onClose } = props
  const speed = useTtsStore((s) => s.speed)
  const setTtsSpeed = useTtsStore((s) => s.setTtsSpeed)

  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLButtonElement | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const [thumbWidth, setThumbWidth] = useState(0)
  const [dragging, setDragging] = useState(false)

  const speedIndex = useMemo(() => {
    const i = Math.round((speed - SPEED_MIN) / SPEED_STEP)
    return Math.min(SPEED_INDEX_MAX, Math.max(0, i))
  }, [speed])

  const displaySpeed = SPEED_LIST[speedIndex].toFixed(1)

  const thumbLeft = useMemo(() => {
    const w = trackWidth - thumbWidth
    if (w <= 0) return thumbWidth / 2
    const leftEdge = (speedIndex / SPEED_INDEX_MAX) * w
    return leftEdge + thumbWidth / 2
  }, [trackWidth, thumbWidth, speedIndex])

  const measure = useCallback(() => {
    if (trackRef.current) setTrackWidth(trackRef.current.getBoundingClientRect().width)
    if (thumbRef.current) setThumbWidth(thumbRef.current.getBoundingClientRect().width)
  }, [])

  useEffect(() => {
    if (visible) requestAnimationFrame(measure)
  }, [visible, measure])

  const indexFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || trackWidth <= 0) return speedIndex
      const rect = track.getBoundingClientRect()
      const x = clientX - rect.left
      const w = trackWidth - thumbWidth
      if (w <= 0) return speedIndex
      const progress = (x - thumbWidth / 2) / w
      const p = Math.min(1, Math.max(0, progress))
      if (p >= (SPEED_INDEX_MAX - 0.5) / SPEED_INDEX_MAX) return SPEED_INDEX_MAX
      return Math.min(SPEED_INDEX_MAX, Math.max(0, Math.round(p * SPEED_INDEX_MAX)))
    },
    [speedIndex, trackWidth, thumbWidth]
  )

  const pickSpeedAtClientX = useCallback(
    (clientX: number) => {
      setTtsSpeed(SPEED_LIST[indexFromClientX(clientX)])
    },
    [indexFromClientX, setTtsSpeed]
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      pickSpeedAtClientX(clientX)
    }
    const onEnd = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [dragging, pickSpeedAtClientX])

  if (!visible) return null

  return (
    <div className="tts-sub-popup-overlay" onClick={onClose}>
      <div className="tts-sub-popup-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="speed-popup">
          <div className="speed-popup-header">
            <button type="button" className="speed-popup-close" aria-label="关闭" onClick={onClose}>
              <span className="speed-popup-close-icon"><ChevronDownIcon /></span>
            </button>
            <span>倍速</span>
          </div>
          <div className={`speed-slider-wrap${dragging ? ' dragging' : ''}`}>
            <span className="label-slow">慢</span>
            <div className="speed-track" ref={trackRef} onClick={(e) => !dragging && pickSpeedAtClientX(e.clientX)}>
              <div className="speed-ticks">
                {Array.from({ length: 15 }).map((_, i) => (
                  <span key={i} className="speed-tick" style={{ left: `${(i + 1) * (100 / 16)}%` }} />
                ))}
              </div>
              <button
                type="button"
                ref={thumbRef}
                className="speed-thumb"
                style={{ left: `${thumbLeft}px` }}
                onMouseDown={() => setDragging(true)}
                onTouchStart={() => setDragging(true)}
              >
                {displaySpeed}
              </button>
            </div>
            <span className="label-fast">快</span>
          </div>
        </div>
      </div>
    </div>
  )
}
