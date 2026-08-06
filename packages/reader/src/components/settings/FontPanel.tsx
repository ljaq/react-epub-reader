/**
 * 字体面板 — 源码对照 old-vue-reader/components/FontPanel/index.vue。
 * 字号 6 档（FONT_SIZE_STEPS）+ 字重三档（normal/light/bold）→ settings-store。
 * 字重选择为底部弹层（van-popup → 自绘 mask + sheet）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FONT_SIZE_MAX,
  FONT_SIZE_STEPS,
  snapFontSize,
  type FontWeightKey
} from '../../store/settings-store'
import { useSettingsStore } from '../../store/settings-store'
import { useUiStore } from '../../store/ui-store'
import { BottomSheet } from '../BottomSheet/BottomSheet'
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  FontLargeIcon,
  FontSmallIcon
} from './FontIcons'
import './settings.css'

const THUMB_SIZE = 22

const FONT_WEIGHT_OPTIONS: { value: FontWeightKey; label: string }[] = [
  { value: 'normal', label: '系统默认' },
  { value: 'light', label: '细字体' },
  { value: 'bold', label: '加粗字体' }
]

const FONT_WEIGHT_LABELS: Record<FontWeightKey, string> = {
  normal: '系统字体',
  light: '细字体',
  bold: '加粗字体'
}

function getClientX(event: MouseEvent | TouchEvent): number | null {
  const me = event as MouseEvent
  if (typeof me.clientX === 'number') return me.clientX
  const touch = (event as TouchEvent).touches?.[0]
  if (touch && typeof touch.clientX === 'number') return touch.clientX
  const changed = (event as TouchEvent).changedTouches?.[0]
  if (changed && typeof changed.clientX === 'number') return changed.clientX
  return null
}

export function FontPanel(): React.ReactNode {
  const uiVisible = useUiStore((s) => s.uiVisible)
  const activePanel = useUiStore((s) => s.activePanel)
  const settings = useSettingsStore()
  const setSettings = useSettingsStore((s) => s.setSettings)

  const visible = uiVisible && activePanel === 'font'

  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLButtonElement | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const [thumbWidth, setThumbWidth] = useState(THUMB_SIZE)
  const [dragging, setDragging] = useState(false)
  const [dragValue, setDragValue] = useState<number | null>(null)
  const [weightPopupVisible, setWeightPopupVisible] = useState(false)

  const fontSize = (() => {
    if (dragValue !== null) return snapFontSize(dragValue)
    return snapFontSize(settings.fontSize)
  })()

  const fontSteps = FONT_SIZE_STEPS as readonly number[]

  const thumbLeft = (() => {
    const w = trackWidth - thumbWidth
    if (w <= 0) return thumbWidth / 2
    const index = Math.max(0, fontSteps.indexOf(fontSize))
    const ratio = index / (fontSteps.length - 1)
    return ratio * w + thumbWidth / 2
  })()
  const activeBarWidth = thumbLeft + thumbWidth / 2

  const measure = useCallback(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (track) setTrackWidth(track.getBoundingClientRect().width)
    if (thumb) setThumbWidth(thumb.getBoundingClientRect().width || THUMB_SIZE)
  }, [])

  useEffect(() => {
    if (visible) {
      const raf = requestAnimationFrame(measure)
      const t = window.setTimeout(measure, 300)
      return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(t)
      }
    }
    setWeightPopupVisible(false)
    return undefined
  }, [visible, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const fontSizeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track) return fontSize
      const rect = track.getBoundingClientRect()
      const w = rect.width - thumbWidth
      if (w <= 0) return FONT_SIZE_MAX
      const x = clientX - rect.left - thumbWidth / 2
      const ratio = Math.min(1, Math.max(0, x / w))
      const stepIndex = Math.round(ratio * (fontSteps.length - 1))
      return fontSteps[stepIndex]
    },
    [fontSize, thumbWidth, fontSteps]
  )

  const applyFontSize = (value: number) => {
    setSettings({ fontSize: snapFontSize(value) })
  }

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return
    const clientX = getClientX(e.nativeEvent)
    if (clientX === null) return
    applyFontSize(fontSizeFromClientX(clientX))
  }

  const onThumbDown = (e: React.SyntheticEvent) => {
    e.preventDefault()
    setDragging(true)
    setDragValue(fontSize)
    measure()
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = getClientX(e)
      if (clientX === null) return
      if (e.cancelable) e.preventDefault()
      setDragValue(fontSizeFromClientX(clientX))
    }
    const onEnd = () => {
      setDragging(false)
      setDragValue((v) => {
        if (v !== null) applyFontSize(v)
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, fontSizeFromClientX])

  const selectFontWeight = (fontWeight: FontWeightKey) => {
    setSettings({ fontWeight })
    setWeightPopupVisible(false)
  }

  const fontWeightLabel = FONT_WEIGHT_LABELS[settings.fontWeight] || FONT_WEIGHT_LABELS.normal

  return (
    <div>
      <div className={`font-panel${visible ? ' font-panel--visible' : ''}`}>
        <span className="font-panel__label">字号</span>
        <div className={`font-panel__slider-wrap${dragging ? ' font-panel__slider-wrap--dragging' : ''}`}>
          <div ref={trackRef} className="font-panel__track" onClick={onTrackClick}>
            <div className="font-panel__track-active" style={{ width: activeBarWidth + 'px' }} />
            <FontSmallIcon />
            <button
              ref={thumbRef}
              type="button"
              className="font-panel__thumb"
              style={{ left: thumbLeft + 'px' }}
              aria-label="字号"
              onMouseDown={onThumbDown}
              onTouchStart={onThumbDown}
            />
            <FontLargeIcon />
          </div>
        </div>
        <button type="button" className="font-panel__weight-trigger" onClick={() => setWeightPopupVisible(true)}>
          <span>{fontWeightLabel}</span>
          <ChevronIcon />
        </button>
      </div>

      <BottomSheet visible={weightPopupVisible} onClose={() => setWeightPopupVisible(false)} height="auto" zIndex={10001}>
        <div className="font-weight-popup">
          <div className="font-weight-popup__header">
            <button
              type="button"
              className="font-weight-popup__close"
              aria-label="关闭"
              onClick={() => setWeightPopupVisible(false)}
            >
              <CloseIcon />
            </button>
            <span className="font-weight-popup__title">字体设置</span>
          </div>
          <div className="font-weight-popup__options">
            {FONT_WEIGHT_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`font-weight-popup__option${settings.fontWeight === item.value ? ' font-weight-popup__option--active' : ''}`}
                onClick={() => selectFontWeight(item.value)}
              >
                <span>{item.label}</span>
                {settings.fontWeight === item.value ? <CheckIcon /> : null}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
