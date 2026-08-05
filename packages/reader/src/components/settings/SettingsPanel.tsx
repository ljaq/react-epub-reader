/**
 * 设置面板 — 源码对照 old-vue-reader/components/SettingsPanel/index.vue。
 * 亮度 / 护眼 / 四主题 / 行距 / 翻页方式 → settings-store。
 * 翻页方式四档（phase-10）：覆盖 / 平移 / 上下滚动 / 仿真（置灰占位，敬请期待）。
 * 翻页方式切换需中断 TTS（Phase 6 接，此处留 hook 注释）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  THEME_MAP,
  type FlipMode,
  type SpacingKey,
  type ThemeKey
} from '../../store/settings-store'
import { useSettingsStore } from '../../store/settings-store'
import { useUiStore } from '../../store/ui-store'
import { stopTtsSessionGlobal } from '../popups/tts/tts-actions'
import { isTtsActivelyPlaying } from '../../store/tts-store'
import { SunSmall, SunLarge } from './SunIcons'
import { EyeCareOff, EyeCareOn, MoonIcon } from './EyeCareIcons'
import './settings.css'

const THUMB_SIZE = 30

const THEME_OPTIONS: { value: ThemeKey; label: string; bg: string }[] = [
  { value: 'white', label: '白色', bg: THEME_MAP.white.bg },
  { value: 'yellow', label: '黄色', bg: THEME_MAP.yellow.bg },
  { value: 'green', label: '绿色', bg: THEME_MAP.green.bg },
  { value: 'dark', label: '暗黑', bg: THEME_MAP.dark.bg }
]

const SPACING_OPTIONS: { value: SpacingKey; label: string; lines: number }[] = [
  { value: 'tight', label: '紧', lines: 4 },
  { value: 'medium', label: '中', lines: 3 },
  { value: 'loose', label: '松', lines: 2 }
]

/** 翻页模式四档（phase-10）：覆盖 / 平移 / 上下滚动 / 仿真（置灰占位，敬请期待） */
const FLIP_MODE_OPTIONS: { value: FlipMode; label: string; disabled?: boolean }[] = [
  { value: 'cover', label: '覆盖' },
  { value: 'slide', label: '平移' },
  { value: 'vertical', label: '上下滚动' },
  { value: 'simulation', label: '仿真', disabled: true }
]

function getClientX(event: MouseEvent | TouchEvent): number | null {
  const me = event as MouseEvent
  if (typeof me.clientX === 'number') return me.clientX
  const touch = (event as TouchEvent).touches?.[0]
  if (touch && typeof touch.clientX === 'number') return touch.clientX
  const changed = (event as TouchEvent).changedTouches?.[0]
  if (changed && typeof changed.clientX === 'number') return changed.clientX
  return null
}

export function SettingsPanel(): React.ReactNode {
  const uiVisible = useUiStore((s) => s.uiVisible)
  const activePanel = useUiStore((s) => s.activePanel)
  const settings = useSettingsStore()
  const setSettings = useSettingsStore((s) => s.setSettings)

  const visible = uiVisible && activePanel === 'settings'

  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLButtonElement | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const [thumbWidth, setThumbWidth] = useState(THUMB_SIZE)
  const [trackReady, setTrackReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dragValue, setDragValue] = useState<number | null>(null)

  const brightnessValue = (() => {
    if (dragValue !== null) return dragValue
    const raw = Number(settings.brightness)
    const value = Number.isFinite(raw) ? raw : BRIGHTNESS_MAX
    return Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, value))
  })()

  const thumbLeft = (() => {
    const w = trackWidth - thumbWidth
    if (w <= 0) return thumbWidth / 2
    const ratio = (brightnessValue - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN)
    return ratio * w + thumbWidth / 2
  })()
  const activeBarWidth = thumbLeft + thumbWidth / 2

  const measure = useCallback(() => {
    if (!visible) return
    const track = trackRef.current
    const thumb = thumbRef.current
    let nextWidth = 0
    if (track) nextWidth = track.getBoundingClientRect().width
    if (thumb) setThumbWidth(thumb.getBoundingClientRect().width || THUMB_SIZE)
    setTrackWidth(nextWidth)
    setTrackReady(nextWidth > 0)
  }, [visible])

  useEffect(() => {
    if (visible) {
      setTrackReady(false)
      const raf = requestAnimationFrame(measure)
      const t = window.setTimeout(measure, 300)
      return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(t)
      }
    }
    setTrackWidth(0)
    setTrackReady(false)
    return undefined
  }, [visible, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const brightnessFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track) return brightnessValue
      const rect = track.getBoundingClientRect()
      const w = rect.width - thumbWidth
      if (w <= 0) return BRIGHTNESS_MAX
      const x = clientX - rect.left - thumbWidth / 2
      const ratio = Math.min(1, Math.max(0, x / w))
      return Math.round(BRIGHTNESS_MIN + ratio * (BRIGHTNESS_MAX - BRIGHTNESS_MIN))
    },
    [brightnessValue, thumbWidth]
  )

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return
    const clientX = getClientX(e.nativeEvent)
    if (clientX === null) return
    setSettings({ brightness: brightnessFromClientX(clientX) })
  }

  const onThumbDown = (e: React.SyntheticEvent) => {
    e.preventDefault()
    setDragging(true)
    setDragValue(brightnessValue)
    measure()
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = getClientX(e)
      if (clientX === null) return
      if (e.cancelable) e.preventDefault()
      setDragValue(brightnessFromClientX(clientX))
    }
    const onEnd = () => {
      setDragging(false)
      setDragValue((v) => {
        if (v !== null) setSettings({ brightness: v })
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
  }, [dragging, brightnessFromClientX])

  const toggleEyeCare = () => {
    setSettings({ eyeCareMode: !settings.eyeCareMode })
  }

  const setFlipMode = (value: FlipMode) => {
    if (value === 'simulation') return
    if (settings.flipMode === value) return
    if (isTtsActivelyPlaying()) {
      window.alert('切换翻页方式将中断语音朗读')
      stopTtsSessionGlobal()
    }
    setSettings({ flipMode: value })
  }

  return (
    <div className={`settings-panel${visible ? ' settings-panel--visible' : ''}`}>
      <div className="settings-panel__row settings-panel__row--brightness">
        <span className="settings-panel__label">亮度</span>
        <div className="settings-panel__brightness">
          <div
            className={`settings-panel__slider-wrap${dragging ? ' settings-panel__slider-wrap--dragging' : ''}${trackReady ? ' settings-panel__slider-wrap--ready' : ''}`}
          >
            <div ref={trackRef} className="settings-panel__track" onClick={onTrackClick}>
              <div className="settings-panel__track-active" style={{ width: activeBarWidth + 'px' }} />
              <SunSmall />
              <button
                ref={thumbRef}
                type="button"
                className="settings-panel__thumb"
                style={{ left: thumbLeft + 'px' }}
                aria-label="亮度"
                onMouseDown={onThumbDown}
                onTouchStart={onThumbDown}
              />
              <SunLarge />
            </div>
          </div>
        </div>
        <button
          type="button"
          className="settings-panel__eye-care"
          onClick={toggleEyeCare}
        >
          <span>护眼模式</span>
          {settings.eyeCareMode ? <EyeCareOn /> : <EyeCareOff />}
        </button>
      </div>

      <div className="settings-panel__row">
        <span className="settings-panel__label">背景</span>
        <div className="settings-panel__themes">
          {THEME_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`settings-panel__theme${settings.theme === item.value ? ' settings-panel__theme--active' : ''}${item.value === 'dark' ? ' settings-panel__theme--dark' : ''}`}
              style={{ backgroundColor: item.bg }}
              aria-label={item.label}
              onClick={() => setSettings({ theme: item.value })}
            >
              {item.value === 'dark' ? <MoonIcon /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-panel__row">
        <span className="settings-panel__label">间距</span>
        <div className="settings-panel__segments settings-panel__segments--spacing">
          {SPACING_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`settings-panel__segment settings-panel__segment--icon${settings.spacing === item.value ? ' settings-panel__segment--active' : ''}`}
              aria-label={item.label}
              onClick={() => setSettings({ spacing: item.value })}
            >
              <span className="settings-panel__spacing-icon">
                <span />
                {Array.from({ length: item.lines }).map((_, i) => (
                  <span key={i} className="settings-panel__spacing-line" />
                ))}
                <span />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-panel__row">
        <span className="settings-panel__label">翻页</span>
        <div className="settings-panel__segments">
          {FLIP_MODE_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`settings-panel__segment${settings.flipMode === item.value ? ' settings-panel__segment--active' : ''}`}
              disabled={item.disabled}
              title={item.disabled ? '敬请期待' : undefined}
              onClick={() => setFlipMode(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
