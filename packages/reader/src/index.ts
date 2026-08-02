/**
 * @react-epub-reader/reader
 *
 * 数据无状态、UI 状态内聚的 React 阅读器库。
 * 详见 plans/00-总览与契约.md。
 */

// 纯数据契约
export type {
  BookMeta,
  BookmarkItem,
  ChapterAccess,
  ChapterContent,
  ChapterLoadState,
  ChapterMeta,
  LineItem,
  NoteItem,
  ReaderUser,
  ReadingSnapshot,
  TtsAudioEntry,
  TtsVoiceType
} from './types/index'

// Props / 回调 / 插槽契约
export type { ReaderChromeSlots, ReaderProps, ReaderSlotCtx, AnnotationFailureSignal } from './types/props'

// 根组件
export { Reader } from './components/Reader'

// Phase 3 — 壳层 / 目录（供宿主按需直接引用）
export { ReaderChrome } from './components/chrome/ReaderChrome'
export type { ReaderChromeProps } from './components/chrome/ReaderChrome'
export { CatalogPopup } from './components/popups/CatalogPopup/CatalogPopup'
export type { CatalogPopupProps } from './components/popups/CatalogPopup/CatalogPopup'

// Phase 2 — store / hooks（供宿主或后续 Phase 组合使用）
export { useSettingsStore } from './store/settings-store'
export { useUiStore } from './store/ui-store'
export { useReadingStore } from './store/reading-store'
export type { NavTarget } from './store/reading-store'
export {
  FONT_SIZE_STEPS,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  DEFAULT_FONT_SIZE,
  BRIGHTNESS_MIN,
  BRIGHTNESS_MAX,
  EYE_CARE_MASK_BG,
  SPACING_LINE_HEIGHT_MAP,
  FONT_WEIGHT_MAP,
  THEME_MAP,
  THEME_BG_MAP,
  DEFAULT_SETTINGS,
  snapFontSize,
  resolveLineHeight,
  resolveFontWeight,
  normalizeSettings
} from './store/settings-store'
export type {
  ReaderSettings,
  SpacingKey,
  FontWeightKey,
  ThemeKey
} from './store/settings-store'
export type { ActivePanel, PopupName, ReaderPopups } from './store/ui-store'
