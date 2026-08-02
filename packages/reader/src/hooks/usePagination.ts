/**
 * 横划分页计算 hook — 消费 core/pagination，layoutLocked / isRebalancing 机制。
 *
 * 源码对照：old-vue-reader/components/ReaderContent/index.vue
 *   updatePagination:956、measureUntilStable:911、runInitialHorizontalLayout:773、
 *   rebalanceBuffer:1030、scheduleRepaginate:725、runRepaginate:877、initResizeObserver:708。
 *
 * 关键常量（与 Vue 逐字对照）：
 * - PAGE_COLUMN_GAP = 40（core/pagination）
 * - 重测间隔 80ms、repaginate debounce 50ms、最多 10 次重试
 * - layoutLocked 期间挂起 repaginate（pendingRepaginateAfterLayout）
 */
import { useCallback, useEffect, useRef } from 'react'
import {
  calculatePagination,
  PAGE_COLUMN_GAP,
  waitForSegmentImages
} from '../core/pagination'
import {
  getReaderContentWidth,
  resolveChapterFetchWidth,
  waitForReaderContentWidth
} from '../core/reader-viewport'
import { useReadingStore } from '../store/reading-store'
import {
  registerRebalanceOrchestrator,
  runEnsureBuffer
} from './buffer-rebalance-bridge'

export interface UsePaginationInput {
  enabled: boolean
  /** 横划视口元素 ref（reader-content__viewport-h） */
  viewportRef: React.RefObject<HTMLElement | null>
  /** 取某章 segment body 元素（reader-content__body--columns） */
  getSegmentBody: (chapterId: number) => Element | null
  /** 是否被访问拦截（blockedChapters），拦截章跳过分页测量 */
  isChapterBlocked: (chapterId: number) => boolean
  /** 分页完成后回调（供 useChapterBuffer 触发预取/回调 width） */
  onMeasured?: (width: number) => void
}

const REPAGINATE_DEBOUNCE_MS = 50
const MEASURE_RETRY_DELAY_MS = 80
const MAX_MEASURE_RETRY = 10

/**
 * 横划分页 hook。enabled=false 时跳过（竖滚模式由 VerticalReader 自行处理）。
 * 返回 triggerRepaginate（供外部主动触发）与 getFetchWidth（供 useChapterBuffer 复用实测宽度）。
 */
export function usePagination(input: UsePaginationInput): {
  triggerRepaginate: () => void
  runInitialLayout: () => Promise<void>
  getFetchWidth: () => number
} {
  const { enabled, viewportRef, getSegmentBody, isChapterBlocked, onMeasured } = input

  const setPageGeometry = useReadingStore((s) => s.setPageGeometry)
  const setMeasuredContentWidth = useReadingStore((s) => s.setMeasuredContentWidth)
  const updateBufferPageCounts = useReadingStore((s) => s.updateBufferPageCounts)
  const setLayoutLocked = useReadingStore((s) => s.setLayoutLocked)
  const setDragOffset = useReadingStore((s) => s.setDragOffset)
  const setRebalancing = useReadingStore((s) => s.setRebalancing)
  const patchBuffer = useReadingStore((s) => s.patchBuffer)

  const repaginateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const measureRetryRef = useRef(0)
  const pendingRepaginateRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const silentExpandRunningRef = useRef(false)
  const onMeasuredRef = useRef(onMeasured)
  onMeasuredRef.current = onMeasured

  const getFetchWidth = useCallback((): number => {
    const w = resolveChapterFetchWidth({ viewportEl: viewportRef.current })
    return w > 0 ? w : getReaderContentWidth(viewportRef.current)
  }, [viewportRef])

  const measurePageHeight = useCallback((): number => {
    // padding 移到 body--columns 后，viewport-h 上下无 padding；
    // 测量第一个 segment body（body--columns）的 clientHeight - padding 才是列实际可用高度
    const order = useReadingStore.getState().buffer.order
    const body = order.length ? getSegmentBody(order[0]) : null
    if (body) {
      const style = window.getComputedStyle(body)
      const pt = parseFloat(style.paddingTop) || 0
      const pb = parseFloat(style.paddingBottom) || 0
      return (body as HTMLElement).clientHeight - pt - pb
    }
    // 回退：viewport-h
    const viewport = viewportRef.current
    if (!viewport) return 0
    const style = window.getComputedStyle(viewport)
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    return viewport.clientHeight - paddingTop - paddingBottom
  }, [viewportRef, getSegmentBody])

  const updatePagination = useCallback((): boolean => {
    if (!enabled) return false
    const viewport = viewportRef.current
    const buffer = useReadingStore.getState().buffer
    const order = buffer.order
    if (!viewport || !order.length) return true

    const nextPageWidth = getReaderContentWidth(viewport)
    if (nextPageWidth <= 0 || viewport.clientWidth <= 0) return true

    const pageGap = PAGE_COLUMN_GAP
    const pageStride = nextPageWidth + pageGap
    const measureOptions = {
      pageGap,
      viewportHeight: measurePageHeight()
    }
    const pageCounts: Record<string, number> = {}
    const pendingRefIds: number[] = []
    const pendingHtmlIds: number[] = []

    order.forEach((id) => {
      if (isChapterBlocked(id)) return
      const segment = buffer.segments[id]
      if (!segment || !segment.html) {
        pendingHtmlIds.push(id)
        return
      }
      const body = getSegmentBody(id)
      if (!body) {
        pendingRefIds.push(id)
        return
      }
      const { pageCount } = calculatePagination(body, nextPageWidth, measureOptions)
      pageCounts[String(id)] = pageCount
    })

    if (pendingHtmlIds.length) {
      return true
    }
    if (pendingRefIds.length && measureRetryRef.current < MAX_MEASURE_RETRY) {
      measureRetryRef.current += 1
      return true
    }

    measureRetryRef.current = 0
    if (Object.keys(pageCounts).length) {
      setPageGeometry({ pageWidth: nextPageWidth, pageGap, pageStride })
      setMeasuredContentWidth(nextPageWidth)
      updateBufferPageCounts(pageCounts, pageStride)
      onMeasuredRef.current?.(nextPageWidth)
    }
    if (!useReadingStore.getState().isRebalancing) {
      // isDragging 时由 useTouchFlip 控制 dragOffset；此处仅复位
      setDragOffset(0)
    }
    return false
  }, [
    enabled,
    viewportRef,
    getSegmentBody,
    isChapterBlocked,
    measurePageHeight,
    setPageGeometry,
    setMeasuredContentWidth,
    updateBufferPageCounts,
    setDragOffset
  ])

  const runRepaginate = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const needsRetry = updatePagination()
        resolve(needsRetry)
      })
    })
  }, [updatePagination])

  const waitForBufferImages = useCallback(async (): Promise<void> => {
    const order = useReadingStore.getState().buffer.order
    const bodies = order
      .map((id) => getSegmentBody(id))
      .filter((b): b is Element => Boolean(b))
    await Promise.all(bodies.map((b) => waitForSegmentImages(b)))
  }, [getSegmentBody])

  const measureUntilStable = useCallback(async (): Promise<void> => {
    let attempt = 0
    let needsRetry = true
    while (needsRetry && attempt < MAX_MEASURE_RETRY) {
      // eslint-disable-next-line no-await-in-loop
      await waitForBufferImages()
      // eslint-disable-next-line no-await-in-loop
      needsRetry = await runRepaginate()
      if (!needsRetry) break
      attempt += 1
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, MEASURE_RETRY_DELAY_MS))
    }
  }, [runRepaginate, waitForBufferImages])

  const scheduleRepaginate = useCallback(() => {
    const state = useReadingStore.getState()
    if (state.layoutLocked || state.buffer.silentExpand) {
      pendingRepaginateRef.current = true
      return
    }
    if (state.buffer.loading) {
      pendingRepaginateRef.current = true
      return
    }
    if (repaginateTimerRef.current) clearTimeout(repaginateTimerRef.current)
    repaginateTimerRef.current = setTimeout(() => {
      repaginateTimerRef.current = null
      void runRepaginate()
    }, REPAGINATE_DEBOUNCE_MS)
  }, [runRepaginate])

  /** 对齐 Vue runSilentBufferExpand：silentExpand 期间测量后清零，恢复翻页 transition。 */
  const runSilentBufferExpand = useCallback(async (): Promise<void> => {
    if (!enabled || silentExpandRunningRef.current) return
    const state = useReadingStore.getState()
    if (!state.buffer.silentExpand || state.isRebalancing) return

    silentExpandRunningRef.current = true
    setLayoutLocked(true)
    measureRetryRef.current = 0

    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await waitForReaderContentWidth(viewportRef.current)
      await measureUntilStable()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    } finally {
      patchBuffer({ silentExpand: false })
      silentExpandRunningRef.current = false
      setLayoutLocked(false)
      if (pendingRepaginateRef.current) {
        pendingRepaginateRef.current = false
        scheduleRepaginate()
      }
    }
  }, [enabled, viewportRef, measureUntilStable, setLayoutLocked, patchBuffer, scheduleRepaginate])

  /** 对齐 Vue rebalanceBuffer：isRebalancing 期间禁用 transition，测量后恢复。 */
  const rebalanceBuffer = useCallback(async (): Promise<void> => {
    if (!enabled || useReadingStore.getState().isRebalancing) return

    setRebalancing(true)
    setLayoutLocked(true)
    setDragOffset(0)
    measureRetryRef.current = 0

    try {
      runEnsureBuffer()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await waitForReaderContentWidth(viewportRef.current)
      await measureUntilStable()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    } finally {
      const state = useReadingStore.getState()
      if (state.buffer.silentExpand) {
        patchBuffer({ silentExpand: false })
      }
      setRebalancing(false)
      setLayoutLocked(false)
      if (pendingRepaginateRef.current) {
        pendingRepaginateRef.current = false
        scheduleRepaginate()
      }
    }
  }, [
    enabled,
    viewportRef,
    measureUntilStable,
    setRebalancing,
    setLayoutLocked,
    setDragOffset,
    patchBuffer,
    scheduleRepaginate
  ])

  const triggerRepaginate = useCallback(() => {
    scheduleRepaginate()
  }, [scheduleRepaginate])

  const markInitialLayoutSettled = useReadingStore((s) => s.markInitialLayoutSettled)

  const runInitialLayout = useCallback(async (): Promise<void> => {
    if (!enabled) return
    setLayoutLocked(true)
    try {
      await waitForReaderContentWidth(viewportRef.current)
      await measureUntilStable()
      // 等两帧让列宽稳定
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    } finally {
      // 无论测量成败都揭开首屏遮罩，避免 spinner 永久卡住
      markInitialLayoutSettled()
      setLayoutLocked(false)
      if (pendingRepaginateRef.current) {
        pendingRepaginateRef.current = false
        scheduleRepaginate()
      }
    }
  }, [
    enabled,
    viewportRef,
    measureUntilStable,
    setLayoutLocked,
    scheduleRepaginate,
    markInitialLayoutSettled
  ])

  // 挂载时若 buffer 已处于 silentExpand，立即测量并清零
  useEffect(() => {
    if (!enabled) return
    const state = useReadingStore.getState()
    if (state.buffer.silentExpand && !state.buffer.loading && !state.isRebalancing) {
      void runSilentBufferExpand()
    }
  }, [enabled, runSilentBufferExpand])

  // silentExpand / loading 变化 → runSilentBufferExpand（对齐 Vue watcher）
  useEffect(() => {
    if (!enabled) return
    const unsub = useReadingStore.subscribe((state, prev) => {
      if (!state.buffer.silentExpand || state.isRebalancing) return
      if (state.buffer.loading) return
      const becameSilent =
        state.buffer.silentExpand && !prev.buffer.silentExpand
      const loadingFinished =
        state.buffer.silentExpand && prev.buffer.loading && !state.buffer.loading
      if (becameSilent || loadingFinished) {
        void runSilentBufferExpand()
      }
    })
    return () => unsub()
  }, [enabled, runSilentBufferExpand])

  // 注册 rebalance orchestrator（供 useChapterBuffer scheduleBufferRebalance 调用）
  useEffect(() => {
    if (!enabled) {
      registerRebalanceOrchestrator(null)
      return
    }
    registerRebalanceOrchestrator(rebalanceBuffer)
    return () => registerRebalanceOrchestrator(null)
  }, [enabled, rebalanceBuffer])

  // buffer.order / settings 变化 → repaginate
  useEffect(() => {
    if (!enabled) return
    const unsub = useReadingStore.subscribe((state, prev) => {
      if (state.buffer.order !== prev.buffer.order && !state.isRebalancing) {
        measureRetryRef.current = 0
        scheduleRepaginate()
      }
    })
    return () => unsub()
  }, [enabled, scheduleRepaginate])

  // ResizeObserver
  useEffect(() => {
    if (!enabled) return
    if (typeof ResizeObserver === 'undefined') return
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => scheduleRepaginate())
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled, viewportRef, scheduleRepaginate])

  // 卸载清理
  useEffect(() => {
    return () => {
      if (repaginateTimerRef.current) clearTimeout(repaginateTimerRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { triggerRepaginate, runInitialLayout, getFetchWidth }
}
