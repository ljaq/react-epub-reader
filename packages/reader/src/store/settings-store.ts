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
 *   fontSize:22, fontWeight:'light', flipMode:'cover', horizontalEnabled:true, eyeCareMode:false }
 * - flipMode 为 phase-10 新增；开发阶段不做老用户习惯迁移——旧 persist 数据
 *   （无 flipMode 或非法值）一律回落默认 cover，不按 horizontalEnabled 推导；
 *   horizontalEnabled 保留为派生字段，下游消费方零改动
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

/** 阅读器主题及其 Chrome / 弹层语义色。 */
export const THEME_MAP = {
  white: {
    bg: '#ffffff',
    color: '#1A1A1A',
    muted: 'rgba(0, 0, 0, 0.45)',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceMuted: '#f5f5f5',
    border: 'rgba(0, 0, 0, 0.08)',
    accent: '#1A1A1A',
    accentSoft: 'rgba(26, 26, 26, 0.12)',
    accentContrast: '#ffffff',
    shadow: 'rgba(0, 0, 0, 0.1)',
    overlay: 'rgba(0, 0, 0, 0.45)'
  },
  yellow: {
    bg: '#FFF5DC',
    color: '#1A1A1A',
    muted: 'rgba(0, 0, 0, 0.45)',
    surface: '#fff9ea',
    surfaceRaised: '#fffdf5',
    surfaceMuted: 'rgba(183, 121, 31, 0.08)',
    border: 'rgba(126, 86, 24, 0.14)',
    accent: '#b7791f',
    accentSoft: 'rgba(183, 121, 31, 0.14)',
    accentContrast: '#ffffff',
    shadow: 'rgba(88, 60, 17, 0.16)',
    overlay: 'rgba(65, 43, 8, 0.45)'
  },
  green: {
    bg: '#D8FBE7',
    color: '#1A1A1A',
    muted: 'rgba(0, 0, 0, 0.45)',
    surface: '#e9fff1',
    surfaceRaised: '#f5fff8',
    surfaceMuted: 'rgba(40, 145, 87, 0.08)',
    border: 'rgba(35, 117, 70, 0.14)',
    accent: '#258c57',
    accentSoft: 'rgba(37, 140, 87, 0.14)',
    accentContrast: '#ffffff',
    shadow: 'rgba(24, 89, 49, 0.16)',
    overlay: 'rgba(13, 61, 32, 0.45)'
  },
  dark: {
    bg: '#332F2F',
    color: '#D8D0D0',
    muted: 'rgba(216, 208, 208, 0.68)',
    surface: '#3d3737',
    surfaceRaised: '#494141',
    surfaceMuted: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.14)',
    accent: '#b9d4ff',
    accentSoft: 'rgba(185, 212, 255, 0.16)',
    accentContrast: '#2b2525',
    shadow: 'rgba(0, 0, 0, 0.32)',
    overlay: 'rgba(0, 0, 0, 0.62)'
  }
} as const

export type ThemeKey = keyof typeof THEME_MAP

export const THEME_BG_MAP: Record<ThemeKey, string> = {
  white: THEME_MAP.white.bg,
  yellow: THEME_MAP.yellow.bg,
  green: THEME_MAP.green.bg,
  dark: THEME_MAP.dark.bg
}

/**
 * 翻页模式：
 * - cover：覆盖（掌阅级：旧页滑出/新页滑入，底层页静止）
 * - slide：平移（整轨横滑）
 * - vertical：上下滚动
 * - simulation：仿真翻页（预留，设置面板置灰占位，不可达渲染分支）
 */
export const FLIP_MODES = ['cover', 'slide', 'vertical', 'simulation'] as const
export type FlipMode = (typeof FLIP_MODES)[number]

export function isFlipMode(value: unknown): value is FlipMode {
  return typeof value === 'string' && (FLIP_MODES as readonly string[]).includes(value)
}

/** horizontalEnabled 为 flipMode 的派生字段：非竖滚即横排。 */
export function deriveHorizontalEnabled(flipMode: FlipMode): boolean {
  return flipMode !== 'vertical'
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'white',
  brightness: 100,
  spacing: 'medium',
  fontSize: DEFAULT_FONT_SIZE,
  fontWeight: 'light',
  flipMode: 'cover',
  horizontalEnabled: true,
  eyeCareMode: false
}

export interface ReaderSettings {
  theme: ThemeKey
  brightness: number
  spacing: SpacingKey
  fontSize: number
  fontWeight: FontWeightKey
  /** 翻页模式枚举；新装默认 cover。 */
  flipMode: FlipMode
  /** 派生同步字段（= flipMode !== 'vertical'），下游消费方零改动保留。 */
  horizontalEnabled: boolean
  eyeCareMode: boolean
}

/**
 * 解析 flipMode：显式合法值优先；旧版 persist 数据（无 flipMode 或非法值）
 * 一律回落默认 cover——开发阶段不做老用户习惯迁移（不按 horizontalEnabled 推导）。
 */
export function resolveFlipMode(settings: Partial<ReaderSettings> = {}): FlipMode {
  if (isFlipMode(settings.flipMode)) {
    return settings.flipMode
  }
  return DEFAULT_SETTINGS.flipMode
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
  const flipMode = resolveFlipMode(settings)
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    fontSize: snapFontSize(settings.fontSize ?? DEFAULT_FONT_SIZE),
    flipMode,
    horizontalEnabled: deriveHorizontalEnabled(flipMode)
  }
}

interface SettingsState extends ReaderSettings {
  setSettings: (partial: Partial<ReaderSettings>) => void
}

/**
 * 阅读设置 store。persist 到 localStorage key 'h5-reader-settings'。
 * 字段：theme/brightness/spacing/fontSize/fontWeight/flipMode/horizontalEnabled/eyeCareMode。
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
        // 传原始 stored（勿先合 DEFAULT_SETTINGS）：flipMode 缺失是旧版数据的判定依据
        const stored = persisted as Partial<ReaderSettings>
        return { ...base, ...normalizeSettings(stored) }
      }
    }
  )
)
