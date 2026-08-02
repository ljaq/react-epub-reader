/**
 * UI 状态 store — uiVisible / activePanel / popups。
 *
 * 源码对照：old-vue-reader/store/reader-context.js 中 ui 相关 mutations
 * （toggleUi:655、setActivePanel:589、openPopup:595、closePopup:608、togglePopup:618）。
 *
 * 仅承载低频 UI 显隐态；高频翻页/拖拽态在 reading-store。
 */
import { create } from 'zustand'

export type PopupName = 'catalog' | 'tts' | 'notes'
export type ActivePanel = 'catalog' | 'notes' | 'tts' | 'bookmark' | 'settings' | 'font' | null

export interface ReaderPopups {
  catalog: boolean
  tts: boolean
  notes: boolean
}

/** 试读结束提示态 — 对齐 Vue reader-context readTip:1027 */
export interface ReadTipState {
  visible: boolean
  showInline: boolean
  showOverlay: boolean
}

/** 图片预览态 — 对齐 Vue reader-context imagePreview */
export interface ImagePreviewState {
  visible: boolean
  url: string
}

/** 脚注 Popover 态 — 对齐 Vue reader-context footnote */
export interface FootnoteState {
  visible: boolean
  text: string
  anchorRect: { left: number; top: number; width: number; height: number } | null
}

interface UiState {
  uiVisible: boolean
  activePanel: ActivePanel
  popups: ReaderPopups
  /** 轻量 Toast（对齐 Vue Vant Toast，Phase 4 划线/批注反馈） */
  toastMessage: string | null
  readTip: ReadTipState
  imagePreview: ImagePreviewState
  footnote: FootnoteState

  toggleUi: () => void
  setUiVisible: (visible: boolean) => void
  setActivePanel: (panel: ActivePanel) => void
  closePanel: () => void

  openPopup: (name: PopupName, options?: { source?: string }) => void
  closePopup: (name: PopupName) => void
  togglePopup: (name: PopupName, options?: { source?: string }) => void
  showToast: (message: string) => void
  clearToast: () => void

  showReadLoginTip: () => void
  hideReadLoginTip: () => void

  hideFootnote: () => void
  showFootnote: (payload: {
    text: string
    anchorRect: { left: number; top: number; width: number; height: number } | null
  }) => void
  toggleFootnote: (imgEl: Element) => void
  hideImagePreview: () => void
  showImagePreview: (url: string) => void

  /** catalog 弹层来源（'chapter' | 'bookmark' | …），供 Phase 3/5 使用 */
  catalogSource: string | null
}

/**
 * UI 显隐 store。对齐 Vue reader-context.state.uiVisible/activePanel/popups。
 * openPopup('catalog'|'notes'|'tts') 时同步关闭 uiVisible 与 activePanel（沿用 Vue 行为）。
 */
let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = create<UiState>((set, get) => ({
  uiVisible: false,
  activePanel: null,
  popups: { catalog: false, tts: false, notes: false },
  toastMessage: null,
  readTip: { visible: false, showInline: false, showOverlay: false },
  imagePreview: { visible: false, url: '' },
  footnote: { visible: false, text: '', anchorRect: null },
  catalogSource: null,

  toggleUi: () => set((s) => ({ uiVisible: !s.uiVisible })),
  setUiVisible: (visible) => set({ uiVisible: visible }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  closePanel: () => set({ activePanel: null }),

  openPopup: (name, _options) => {
    if (!Object.prototype.hasOwnProperty.call(get().popups, name)) {
      return
    }
    set((s) => ({
      popups: { ...s.popups, [name]: true },
      uiVisible: false,
      activePanel: null,
      catalogSource: name === 'catalog' && _options?.source ? _options.source : s.catalogSource
    }))
  },
  closePopup: (name) => {
    if (!Object.prototype.hasOwnProperty.call(get().popups, name)) {
      return
    }
    set((s) => ({
      popups: { ...s.popups, [name]: false },
      catalogSource: name === 'catalog' ? null : s.catalogSource
    }))
  },
  togglePopup: (name, options) => {
    if (get().popups[name]) {
      get().closePopup(name)
    } else {
      get().openPopup(name, options)
    }
  },

  showToast: (message) => {
    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    set({ toastMessage: message })
    toastTimer = setTimeout(() => {
      toastTimer = null
      set({ toastMessage: null })
    }, 2000)
  },
  clearToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toastMessage: null })
  },

  showReadLoginTip: () =>
    set({
      readTip: { visible: true, showInline: true, showOverlay: true }
    }),

  hideReadLoginTip: () =>
    set({
      readTip: { visible: false, showInline: false, showOverlay: false }
    }),

  hideFootnote: () =>
    set({
      footnote: { visible: false, text: '', anchorRect: null }
    }),

  showFootnote: ({ text, anchorRect }) => {
    if (!text) {
      get().hideFootnote()
      return
    }
    set({
      imagePreview: { visible: false, url: '' },
      uiVisible: false,
      activePanel: null,
      footnote: { visible: true, text, anchorRect }
    })
  },

  toggleFootnote: (imgEl) => {
    const state = get()
    if (state.footnote.visible) {
      state.hideFootnote()
      return
    }
    const text = imgEl?.getAttribute('zy-footnote') || ''
    if (!text) return
    const rect = imgEl.getBoundingClientRect()
    state.showFootnote({
      text,
      anchorRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }
    })
  },

  hideImagePreview: () =>
    set({
      imagePreview: { visible: false, url: '' }
    }),

  showImagePreview: (url) => {
    if (!url) return
    get().hideFootnote()
    set({
      uiVisible: false,
      activePanel: null,
      imagePreview: { visible: true, url }
    })
  }
}))
