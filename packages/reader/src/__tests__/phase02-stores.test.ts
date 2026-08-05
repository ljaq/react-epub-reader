/**
 * Phase 2 store / 常量单测。
 *
 * 覆盖 settings-store（常量与 snapFontSize/normalizeSettings/resolveLineHeight/resolveFontWeight）、
 * ui-store（toggleUi/openPopup/closePopup/togglePopup）、
 * reading-store（setGlobalPageIndex 同步 chapterId/pageIndex、updateBufferPageCounts 修正、
 * dragOffset 独立 slice）、useTouchFlip 常量（DRAG_THRESHOLD=40 / AXIS_LOCK_THRESHOLD=8）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  FONT_SIZE_STEPS,
  DEFAULT_FONT_SIZE,
  snapFontSize,
  resolveLineHeight,
  resolveFontWeight,
  normalizeSettings,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  useSettingsStore
} from '../store/settings-store'
import { useUiStore } from '../store/ui-store'
import { useReadingStore } from '../store/reading-store'
import { DRAG_THRESHOLD, AXIS_LOCK_THRESHOLD } from '../hooks/useTouchFlip'

beforeEach(() => {
  // 重置 zustand store（非 persist 部分直接 setState）
  useSettingsStore.setState({ ...DEFAULT_SETTINGS }, false)
  useUiStore.setState({
    uiVisible: false,
    activePanel: null,
    popups: { catalog: false, tts: false, notes: false },
    catalogSource: null
  })
  useReadingStore.getState().setChapterId(0)
  useReadingStore.setState({
    globalPageIndex: 0,
    dragOffset: 0,
    isRebalancing: false,
    layoutLocked: false,
    buffer: {
      order: [],
      segments: {},
      totalPages: 1,
      totalWidthPx: 0,
      loading: false,
      silentExpand: false
    },
    pageWidth: 0,
    pageGap: 40,
    pageStride: 0,
    measuredContentWidth: 0,
    bufferReady: false,
    initialLayoutSettled: false,
    bootContentReady: false,
    neighborPreloadStarted: false,
    navTarget: null
  })
})

describe('settings-store 常量', () => {
  it('FONT_SIZE_STEPS 与 Vue 逐字一致', () => {
    expect(FONT_SIZE_STEPS).toEqual([16, 18, 20, 22, 24, 26])
  })

  it('DEFAULT_FONT_SIZE = 22（index 3）', () => {
    expect(DEFAULT_FONT_SIZE).toBe(22)
  })

  it('STORAGE_KEY = h5-reader-settings', () => {
    expect(STORAGE_KEY).toBe('h5-reader-settings')
  })

  it('DEFAULT_SETTINGS 与 Vue 逐字一致（phase-10 新增 flipMode）', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'white',
      brightness: 100,
      spacing: 'medium',
      fontSize: 22,
      fontWeight: 'light',
      flipMode: 'cover',
      horizontalEnabled: true,
      eyeCareMode: false
    })
  })
})

describe('snapFontSize', () => {
  it('取最接近的 step', () => {
    expect(snapFontSize(21)).toBe(20)
    expect(snapFontSize(23)).toBe(22)
    expect(snapFontSize(25)).toBe(24)
    expect(snapFontSize(15)).toBe(16)
    expect(snapFontSize(27)).toBe(26)
  })

  it('非法值回退 DEFAULT_FONT_SIZE', () => {
    expect(snapFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE)
  })
})

describe('resolveLineHeight / resolveFontWeight', () => {
  it('SPACING_LINE_HEIGHT_MAP = { tight:1.5, medium:2, loose:2.5 }', () => {
    expect(resolveLineHeight('tight')).toBe(1.5)
    expect(resolveLineHeight('medium')).toBe(2)
    expect(resolveLineHeight('loose')).toBe(2.5)
  })

  it('FONT_WEIGHT_MAP = { normal:400, light:300, bold:900 }', () => {
    expect(resolveFontWeight('normal')).toBe(400)
    expect(resolveFontWeight('light')).toBe(300)
    expect(resolveFontWeight('bold')).toBe(900)
  })

  it('未知值回退默认', () => {
    expect(resolveLineHeight('xxx' as never)).toBe(2)
    expect(resolveFontWeight('xxx' as never)).toBe(400)
  })
})

describe('normalizeSettings', () => {
  it('补全默认字段 + snap fontSize', () => {
    const r = normalizeSettings({ fontSize: 21 })
    expect(r.fontSize).toBe(20)
    expect(r.theme).toBe('white')
    expect(r.horizontalEnabled).toBe(true)
  })
})

describe('settings-store setSettings', () => {
  it('partial 更新 + snap', () => {
    useSettingsStore.getState().setSettings({ fontSize: 25 })
    expect(useSettingsStore.getState().fontSize).toBe(24)
  })
})

describe('ui-store', () => {
  it('toggleUi 翻转 uiVisible', () => {
    useUiStore.getState().toggleUi()
    expect(useUiStore.getState().uiVisible).toBe(true)
    useUiStore.getState().toggleUi()
    expect(useUiStore.getState().uiVisible).toBe(false)
  })

  it('openPopup(catalog|notes|tts) 同步关闭 uiVisible + activePanel', () => {
    useUiStore.getState().setUiVisible(true)
    useUiStore.getState().setActivePanel('catalog')
    useUiStore.getState().openPopup('tts')
    const s = useUiStore.getState()
    expect(s.popups.tts).toBe(true)
    expect(s.uiVisible).toBe(false)
    expect(s.activePanel).toBeNull()
  })

  it('closePopup(catalog) 清空 catalogSource', () => {
    useUiStore.getState().openPopup('catalog', { source: 'chapter' })
    expect(useUiStore.getState().catalogSource).toBe('chapter')
    useUiStore.getState().closePopup('catalog')
    expect(useUiStore.getState().popups.catalog).toBe(false)
    expect(useUiStore.getState().catalogSource).toBeNull()
  })

  it('togglePopup 翻转', () => {
    useUiStore.getState().togglePopup('notes')
    expect(useUiStore.getState().popups.notes).toBe(true)
    useUiStore.getState().togglePopup('notes')
    expect(useUiStore.getState().popups.notes).toBe(false)
  })
})

describe('reading-store setGlobalPageIndex 同步 chapterId/pageIndex', () => {
  it('globalToLocal 反映到 chapterId/pageIndex', () => {
    useReadingStore.setState({
      buffer: {
        order: [10, 11],
        segments: {
          10: {
            chapterId: 10,
            html: 'a',
            content: null,
            pageCount: 3,
            widthPx: 0,
            offsetPages: 0
          },
          11: {
            chapterId: 11,
            html: 'b',
            content: null,
            pageCount: 2,
            widthPx: 0,
            offsetPages: 3
          }
        },
        totalPages: 5,
        totalWidthPx: 0,
        loading: false,
        silentExpand: false
      }
    })
    useReadingStore.getState().setGlobalPageIndex(4)
    const s = useReadingStore.getState()
    expect(s.globalPageIndex).toBe(4)
    expect(s.chapterId).toBe(11)
    expect(s.pageIndex).toBe(1)
  })

  it('clamp 到 totalPages', () => {
    useReadingStore.setState({
      buffer: {
        order: [1],
        segments: {
          1: { chapterId: 1, html: 'a', content: null, pageCount: 2, widthPx: 0, offsetPages: 0 }
        },
        totalPages: 2,
        totalWidthPx: 0,
        loading: false,
        silentExpand: false
      }
    })
    useReadingStore.getState().setGlobalPageIndex(99)
    expect(useReadingStore.getState().globalPageIndex).toBe(1)
  })
})

describe('reading-store dragOffset 独立 slice', () => {
  it('setDragOffset 不触发 chapterId/pageIndex 变更', () => {
    useReadingStore.getState().setChapterId(5)
    useReadingStore.getState().setGlobalPageIndex(0)
    const before = {
      chapterId: useReadingStore.getState().chapterId,
      pageIndex: useReadingStore.getState().pageIndex
    }
    useReadingStore.getState().setDragOffset(120)
    expect(useReadingStore.getState().dragOffset).toBe(120)
    const after = useReadingStore.getState()
    expect(after.chapterId).toBe(before.chapterId)
    expect(after.pageIndex).toBe(before.pageIndex)
  })
})

describe('useTouchFlip 常量与 Vue 逐字一致', () => {
  it('DRAG_THRESHOLD = 40', () => {
    expect(DRAG_THRESHOLD).toBe(40)
  })
  // phase-12：8 → 4（覆盖模式微动手势无响应修复，兼顾防误触与跟手）
  it('AXIS_LOCK_THRESHOLD = 4', () => {
    expect(AXIS_LOCK_THRESHOLD).toBe(4)
  })
})
