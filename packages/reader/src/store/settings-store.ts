/**
 * 阅读设置 store — zustand persist → localStorage。
 *
 * 源码对照：old-vue-reader/store/reader-settings.js:1-110
 *
 * 关键常量（与 Vue 逐字对照）：
 * - STORAGE_KEY = 'h5-reader-settings'
 * - FONT_SIZE_STEPS = [16,18,20,22,24,26]，DEFAULT_FONT_SIZE = 22（index 3）
 * - SPACING_LINE_HEIGHT_MAP = { tight:1.5, medium:2, loose:2.5 }
 * - FONT_WEIGHT_MAP = { normal:400, light:300, bold:900 }
 * - THEME_MAP / THEME_BG_MAP
 * - DEFAULT_SETTINGS = { theme:'white', brightness:100, spacing:'medium',
 *   fontSize:22, fontWeight:'light', horizontalEnabled:true, eyeCareMode:false }
 */
import { persist, createJSONStorage } from 'zustand/middleware'
import { create } from 'zustand'

export const STORAGE_KEY = 'h5-reader-settings'

export const FONT_SIZE_STEPS = [16, 18, 20, 22, 24, 26] as const
export const FONT_SIZE_MIN: number = FONT_SIZE_STEPS[0]
export const FONT_SIZE_MAX: number = FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1]
export const DEFAULT_FONT_SIZE: number = FONT_SIZE_STEPS[3]

export const BRIGHTNESS_MIN = 0
export const BRIGHTNESS_MAX = 100

/** 与 openwap_fe `.huyan_mask` 一致：全屏 fixed 遮罩，pointer-events: none */
export const EYE_CARE_MASK_BG = 'rgba(255, 141, 0, 0.1)'

/** openwap changeLH: line-height = lineSpacePercent + 1 */
export const SPACING_LINE_HEIGHT_MAP = {
  tight: 1.5,
  medium: 2,
  loose: 2.5
} as const

export type SpacingKey = keyof typeof SPACING_LINE_HEIGHT_MAP

/** openwap fontf_list type 属性 */
export const FONT_WEIGHT_MAP = {
  normal: 400,
  light: 300,
  bold: 900
} as const

export type FontWeightKey = keyof typeof FONT_WEIGHT_MAP

/** 项目主题色（背景/文字色保持不变） */
export const THEME_MAP = {
  white: { bg: '#ffffff', color: '#1A1A1A', muted: 'rgba(0, 0, 0, 0.45)' },
  yellow: { bg: '#FFF5DC', color: '#1A1A1A', muted: 'rgba(0, 0, 0, 0.45)' },
  green: { bg: '#D8FBE7', color: '#1A1A1A', muted: 'rgba(0, 0, 0, 0.45)' },
  dark: { bg: '#332F2F', color: '#999999', muted: 'rgba(153, 153, 153, 0.7)' }
} as const

export type ThemeKey = keyof typeof THEME_MAP

export const THEME_BG_MAP: Record<ThemeKey, string> = {
  white: THEME_MAP.white.bg,
  yellow: THEME_MAP.yellow.bg,
  green: THEME_MAP.green.bg,
  dark: THEME_MAP.dark.bg
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'white',
  brightness: 100,
  spacing: 'medium',
  fontSize: DEFAULT_FONT_SIZE,
  fontWeight: 'light',
  horizontalEnabled: true,
  eyeCareMode: false
}

export interface ReaderSettings {
  theme: ThemeKey
  brightness: number
  spacing: SpacingKey
  fontSize: number
  fontWeight: FontWeightKey
  horizontalEnabled: boolean
  eyeCareMode: boolean
}

/** 对齐 Vue snapFontSize：取 FONT_SIZE_STEPS 中最接近的值。 */
export function snapFontSize(value: number): number {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return DEFAULT_FONT_SIZE
  }

  let closest: number = FONT_SIZE_STEPS[0]
  let minDiff = Math.abs(num - closest)

  FONT_SIZE_STEPS.forEach(step => {
    const diff = Math.abs(num - step)
    if (diff < minDiff) {
      minDiff = diff
      closest = step
    }
  })

  return closest
}

export function resolveLineHeight(spacing: SpacingKey): number {
  return SPACING_LINE_HEIGHT_MAP[spacing] ?? SPACING_LINE_HEIGHT_MAP.medium
}

export function resolveFontWeight(fontWeight: FontWeightKey): number {
  return FONT_WEIGHT_MAP[fontWeight] ?? FONT_WEIGHT_MAP.normal
}

export function normalizeSettings(settings: Partial<ReaderSettings> = {}): ReaderSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    fontSize: snapFontSize(settings.fontSize ?? DEFAULT_FONT_SIZE)
  }
}

interface SettingsState extends ReaderSettings {
  setSettings: (partial: Partial<ReaderSettings>) => void
}

/**
 * 阅读设置 store。persist 到 localStorage key 'h5-reader-settings'。
 * 字段：theme/brightness/spacing/fontSize/fontWeight/horizontalEnabled/eyeCareMode。
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      setSettings: (partial) =>
        set((state) => normalizeSettings({ ...state, ...partial }))
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof localStorage !== 'undefined' ? localStorage : (undefined as unknown as Storage)
      ),
      merge: (persisted, current) => {
        const base = current as SettingsState
        if (!persisted || typeof persisted !== 'object') {
          return { ...base, ...DEFAULT_SETTINGS }
        }
        const stored = persisted as Partial<ReaderSettings>
        return { ...base, ...normalizeSettings({ ...DEFAULT_SETTINGS, ...stored }) }
      }
    }
  )
)
