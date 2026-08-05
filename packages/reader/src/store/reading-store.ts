/**
 * 阅读引擎高频状态 store — 独立 zustand slice。
 *
 * 源码对照：old-vue-reader/store/reader-context.js 中翻页/buffer 相关 state + mutations
 * （syncChapterFromGlobal:134、setGlobalPageIndex:1074、updateBufferPageCounts:1081、
 *  setMeasuredContentWidth:1093、initChapterBufferFast:1097、ensureChapterBuffer:1134、
 *  resetReadingPosition:1070、setPageIndex:1061、setPageCount:1065）。
 *
 * 关键约束（plans/00 §3、phase-02 核心约束 5）：
 * - globalPageIndex / dragOffset / isRebalancing / layoutLocked 必须放本独立 slice，
 *   不得放 Reader 根组件 state 或 ui-store，避免高频更新触发全树重渲染（Vue 版性能顽疾）。
 * - segmentOffsets 同步自 buffer，供横划 track 偏移计算用。
 */
import { create } from 'zustand'
import {
  clampPageIndex,
  PAGE_COLUMN_GAP
} from '../core/pagination'
import type { NavTarget } from '../core/reading-position/nav-target'
import {
  createEmptyBuffer,
  globalToLocal,
  localToGlobal,
  rebuildSegmentOffsets,
  type BufferSegment,
  type ChapterBuffer
} from '../core/chapter-buffer'

export type { NavTarget }

/** 当前阅读快照局部态 — 对齐 Vue reader.state.readingSnapshot */
export interface ReadingSnapshotState {
  domPos: string
  summary: string
  rawSummary?: string
  precent: number
  strIdx: number
  atChapterEnd: boolean
}

interface ReadingState {
  // ── 当前章节定位 ──
  chapterId: number
  pageIndex: number
  pageCount: number

  // ── 高频翻页/拖拽（独立 slice 核心） ──
  globalPageIndex: number
  dragOffset: number
  /** 当前横向拖拽起点 clientX（pointerdown 记录，endDrag 复位 0）；覆盖模式右滑前缘锚定手指用 */
  dragStartX: number
  isRebalancing: boolean
  layoutLocked: boolean
  /** 拖拽 + 翻页动画期间为 true，用于翻页阴影显隐 */
  isFlipping: boolean
  /**
   * 覆盖模式补间动画进行中（phase-10）：此期间禁止 rebalance/silentExpand
   * 滑动 buffer 窗口，防止克隆源/规范流在动画中途被替换穿帮；动画结束补跑 ensureBuffer。
   */
  flipAnimating: boolean

  // ── 分页测量 ──
  pageWidth: number
  pageGap: number
  pageStride: number
  measuredContentWidth: number

  // ── 章节缓冲区 ──
  buffer: ChapterBuffer
  bufferReady: boolean
  initialLayoutSettled: boolean
  /**
   * 首屏遮罩揭开条件（对齐 Vue）：分页完成 + initialPosition 无动画还原完成后才为 true。
   * 与 initialLayoutSettled 分离，避免「揭开后立刻滚动画」露馅。
   */
  bootContentReady: boolean
  neighborPreloadStarted: boolean

  // ── 定位还原 ──
  navTarget: NavTarget | null
  readingSnapshot: ReadingSnapshotState

  // ── actions ──
  setChapterId: (id: number) => void
  setPageIndex: (index: number) => void
  setPageCount: (count: number) => void
  setGlobalPageIndex: (index: number) => void
  setDragOffset: (offset: number) => void
  setDragStartX: (x: number) => void
  setRebalancing: (value: boolean) => void
  setLayoutLocked: (value: boolean) => void
  setFlipping: (value: boolean) => void
  setFlipAnimating: (value: boolean) => void
  setPageGeometry: (geo: { pageWidth: number; pageGap: number; pageStride: number }) => void
  setMeasuredContentWidth: (width: number) => void
  setBuffer: (buffer: ChapterBuffer) => void
  patchBuffer: (patch: Partial<ChapterBuffer>) => void
  updateBufferPageCounts: (pageCounts: Record<string, number>, pageStride?: number) => void
  setBufferReady: (value: boolean) => void
  markInitialLayoutSettled: () => void
  markBootContentReady: () => void
  setNeighborPreloadStarted: (value: boolean) => void
  setNavTarget: (target: NavTarget | null) => void
  clearNavTarget: () => void
  updateReadingSnapshot: (partial: Partial<ReadingSnapshotState>) => void
  resetReadingPosition: () => void
  resetForChapterSwitch: (chapterId: number) => void
}

function syncChapterFromGlobal(state: ReadingState): Partial<ReadingState> {
  const local = globalToLocal(state.globalPageIndex, state.buffer)
  const segment = state.buffer.segments[local.chapterId]
  const pageCount = Math.max(1, segment?.pageCount || 1)
  return {
    chapterId: local.chapterId,
    pageIndex: local.pageIndex,
    pageCount
  }
}

/**
 * 阅读引擎高频 store。dragOffset/globalPageIndex/isRebalancing/layoutLocked
 * 均在此独立 slice，组件按需 selector 订阅，避免全树重渲染。
 */
export const useReadingStore = create<ReadingState>((set) => ({
  chapterId: 0,
  pageIndex: 0,
  pageCount: 1,

  globalPageIndex: 0,
  dragOffset: 0,
  dragStartX: 0,
  isRebalancing: false,
  layoutLocked: false,
  isFlipping: false,
  flipAnimating: false,

  pageWidth: 0,
  pageGap: PAGE_COLUMN_GAP,
  pageStride: 0,
  measuredContentWidth: 0,

  buffer: createEmptyBuffer(),
  bufferReady: false,
  initialLayoutSettled: false,
  bootContentReady: false,
  neighborPreloadStarted: false,

  navTarget: null,
  readingSnapshot: {
    domPos: '0=1=0=0#0',
    summary: '',
    precent: 0,
    strIdx: 0,
    atChapterEnd: false
  },

  setChapterId: (id) => set({ chapterId: Number(id) }),

  setPageIndex: (index) =>
    set((s) => ({ pageIndex: clampPageIndex(index, s.pageCount) })),

  setPageCount: (count) =>
    set((s) => {
      const nextCount = Math.max(1, Number(count) || 1)
      return {
        pageCount: nextCount,
        pageIndex: clampPageIndex(s.pageIndex, nextCount)
      }
    }),

  setGlobalPageIndex: (index) =>
    set((s) => {
      const totalPages = Math.max(1, s.buffer.totalPages || 1)
      const nextGlobal = clampPageIndex(index, totalPages)
      const draft: Partial<ReadingState> = { globalPageIndex: nextGlobal }
      Object.assign(draft, syncChapterFromGlobal({ ...s, ...draft }))
      return draft
    }),

  setDragOffset: (offset) => set({ dragOffset: offset }),
  setDragStartX: (x) => set({ dragStartX: Math.max(0, Number(x) || 0) }),
  setRebalancing: (value) => set({ isRebalancing: value }),
  setLayoutLocked: (value) => set({ layoutLocked: value }),
  setFlipping: (value) => set({ isFlipping: value }),
  setFlipAnimating: (value) => set({ flipAnimating: value }),

  setPageGeometry: ({ pageWidth, pageGap, pageStride }) =>
    set({ pageWidth, pageGap, pageStride }),

  setMeasuredContentWidth: (width) =>
    set({ measuredContentWidth: Math.max(0, Number(width) || 0) }),

  setBuffer: (buffer) =>
    set((s) => {
      const draft: Partial<ReadingState> = { buffer }
      Object.assign(draft, syncChapterFromGlobal({ ...s, ...draft }))
      return draft
    }),

  patchBuffer: (patch) =>
    set((s) => {
      const nextBuffer = { ...s.buffer, ...patch }
      const draft: Partial<ReadingState> = { buffer: nextBuffer }
      Object.assign(draft, syncChapterFromGlobal({ ...s, ...draft }))
      return draft
    }),

  updateBufferPageCounts: (pageCounts, pageStride = 0) =>
    set((s) => {
      const anchorChapterId = s.chapterId
      const anchorPageIndex = s.pageIndex
      // 深拷贝 segments（rebuildSegmentOffsets 会原地改 offsetPages/offsetPx/widthPx），
      // 但保持 order 引用不变，避免 usePagination 的 subscribe 误判 order 变化触发循环。
      const nextSegments: Record<number, BufferSegment> = {}
      s.buffer.order.forEach((id) => {
        const seg = s.buffer.segments[id]
        if (seg) nextSegments[id] = { ...seg }
      })
      Object.keys(pageCounts).forEach((key) => {
        const id = Number(key)
        const seg = nextSegments[id]
        if (seg) seg.pageCount = Math.max(1, Number(pageCounts[key]) || 1)
      })
      const nextBuffer: ChapterBuffer = {
        ...s.buffer,
        // order 保持原引用，subscribe 比较 order !== prev.order 为 false，断开循环
        segments: nextSegments
      }
      rebuildSegmentOffsets(nextBuffer, pageStride)
      const totalPages = Math.max(1, nextBuffer.totalPages || 1)
      const nextGlobal = clampPageIndex(
        localToGlobal(anchorChapterId, anchorPageIndex, nextBuffer),
        totalPages
      )
      const draft: Partial<ReadingState> = {
        buffer: nextBuffer,
        globalPageIndex: nextGlobal
      }
      Object.assign(draft, syncChapterFromGlobal({ ...s, ...draft }))
      return draft
    }),

  setBufferReady: (value) => set({ bufferReady: value }),
  markInitialLayoutSettled: () => set({ initialLayoutSettled: true }),
  markBootContentReady: () => set({ bootContentReady: true }),
  setNeighborPreloadStarted: (value) => set({ neighborPreloadStarted: value }),

  setNavTarget: (target) => set({ navTarget: target }),
  clearNavTarget: () => set({ navTarget: null }),

  updateReadingSnapshot: (partial) =>
    set((s) => ({
      readingSnapshot: { ...s.readingSnapshot, ...partial }
    })),

  resetReadingPosition: () =>
    set((s) => ({
      pageIndex: 0,
      globalPageIndex: localToGlobal(s.chapterId, 0, s.buffer)
    })),

  resetForChapterSwitch: (_chapterId) =>
    set({
      neighborPreloadStarted: false,
      navTarget: null
    })
}))

export type { BufferSegment, ChapterBuffer }
export { rebuildSegmentOffsets }
