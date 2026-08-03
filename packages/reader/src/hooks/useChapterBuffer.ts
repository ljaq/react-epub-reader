/**
 * 章节缓冲区 hook — 消费宿主注入的 chapters prop 组装 buffer，输出 onChapterChange/onPrefetch。
 *
 * 源码对照：old-vue-reader/store/reader-context.js
 *   rebuildChapterBuffer:337、initChapterBuffer:1128、ensureChapterBuffer:1134、
 *   fetchNeighborsInBackground:310、mergeNeighborContentsIntoBuffer:260、
 *   shouldPreserveAnchor:255、applyBufferCenterState:238、getViewportWidth:127。
 *
 * 与 Vue 的根本差异（plans/00 §3 状态边界）：reader 包零 fetch，章节内容来自 Props
 * （chapters: Record<id, ChapterContent>）。本 hook 不调用任何 API，仅：
 *  1. 按 chapterList + 当前 chapterId 计算 buffer range（computeBufferRange）；
 *  2. 从 chapters prop 取已就绪章节组装 segment（mergeBufferContents + rebuildSegmentOffsets）；
 *  3. 缺章时 emit onChapterChange(id, width) 请求宿主 fetch，emit onPrefetch(range, width) 预取；
 *  4. chapters prop 更新后合并新章节进 buffer（preserveAnchor + silentExpand，无 DOM 闪烁）；
 *  5. chapterId 逼近边缘时 debounce rebalance（对齐 Vue scheduleEnsureBuffer → rebalanceBuffer）；
 *  6. chapterAccess 拦截（needLogin/needPurchase）→ 过滤 + emit onLoginRequired。
 */
import { useEffect, useRef } from 'react'
import type {
  ChapterAccess,
  ChapterContent,
  ChapterLoadState,
  ChapterMeta
} from '../types'
import {
  CHAPTER_BUFFER_RADIUS,
  computeBufferRange,
  filterBlockedChapterOrder,
  getMissingBufferIds,
  isSegmentReady,
  localToGlobal,
  mergeBufferContents,
  rebuildSegmentOffsets,
  shouldRebalanceBuffer,
  type ChapterBuffer,
  type FetchedChapterContent
} from '../core/chapter-buffer'
import { clampPageIndex, PAGE_COLUMN_GAP } from '../core/pagination'
import { getReaderContentWidthFallback } from '../core/reader-viewport'
import { useReadingStore } from '../store/reading-store'
import {
  clearBufferRebalanceBridge,
  registerEnsureBuffer,
  registerGoChapter,
  scheduleBufferRebalance
} from './buffer-rebalance-bridge'

export interface UseChapterBufferInput {
  bookId: number
  chapterList: ChapterMeta[]
  chapters: Record<number, ChapterContent>
  chapterAccess: Record<number, ChapterAccess>
  chapterLoadStates: Record<number, ChapterLoadState>
  initialChapterId?: number
  /** 宿主注入的容器宽度测量函数（默认回退 398）。横划时由 usePagination 提供实测值。 */
  getFetchWidth?: () => number
  /** 已登录；未登录时跳过付费章预取 */
  isLoggedIn: boolean
  /** 付费章起点（bookMeta.paidChapterStart） */
  paidChapterStart?: number
  onChapterChange?: (chapterId: number, width: number) => void
  onPrefetch?: (chapterIds: number[], width: number) => void
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
  onError?: (payload: { scope: string; message: string }) => void
}

function toFetched(content: ChapterContent): FetchedChapterContent {
  return { code: 0, html: content.html || '' }
}

function collectReadyContents(
  chapters: Record<number, ChapterContent>,
  order: number[]
): Record<number, FetchedChapterContent> {
  const contents: Record<number, FetchedChapterContent> = {}
  order.forEach((id) => {
    const c = chapters[Number(id)]
    if (c && c.html) {
      contents[Number(id)] = toFetched(c)
    }
  })
  return contents
}

function buildBlockedMap(
  chapterAccess: Record<number, ChapterAccess>,
  order: number[]
): Record<number, boolean> {
  const blocked: Record<number, boolean> = {}
  order.forEach((id) => {
    const acc = chapterAccess[Number(id)]
    if (acc && (acc.needLogin || acc.needPurchase)) {
      blocked[Number(id)] = true
    }
  })
  return blocked
}

function shouldPreserveAnchor(
  bufferReady: boolean,
  buffer: ChapterBuffer,
  centerId: number
): boolean {
  const center = buffer.segments[Number(centerId)]
  return Boolean(bufferReady && isSegmentReady(center))
}

function resolvePageStride(measuredContentWidth: number, pageStride: number): number {
  if (measuredContentWidth > 0) {
    return measuredContentWidth + PAGE_COLUMN_GAP
  }
  return pageStride > 0 ? pageStride : 0
}

/**
 * 章节缓冲区 hook。返回当前 buffer 与显式 rebalance 方法（供翻页至边缘时调用）。
 */
export function useChapterBuffer(input: UseChapterBufferInput): {
  rebalance: (centerId?: number) => void
} {
  const {
    bookId,
    chapterList,
    chapters,
    chapterAccess,
    chapterLoadStates,
    initialChapterId,
    getFetchWidth,
    isLoggedIn,
    paidChapterStart,
    onChapterChange,
    onPrefetch,
    onLoginRequired,
    onError
  } = input

  const setBuffer = useReadingStore((s) => s.setBuffer)
  const patchBuffer = useReadingStore((s) => s.patchBuffer)
  const chapterIdRef = useReadingStore((s) => s.chapterId)
  const setGlobalPageIndex = useReadingStore((s) => s.setGlobalPageIndex)
  const setBufferReady = useReadingStore((s) => s.setBufferReady)
  const resetForChapterSwitch = useReadingStore((s) => s.resetForChapterSwitch)
  const clearNavTarget = useReadingStore((s) => s.clearNavTarget)
  const setNeighborPreloadStarted = useReadingStore((s) => s.setNeighborPreloadStarted)

  const chaptersRef = useRef(chapters)
  chaptersRef.current = chapters
  const chapterListRef = useRef(chapterList)
  chapterListRef.current = chapterList
  const chapterAccessRef = useRef(chapterAccess)
  chapterAccessRef.current = chapterAccess

  // 回调最新引用，避免 effect 依赖回调导致重跑
  const cbRef = useRef({
    onChapterChange,
    onPrefetch,
    onLoginRequired,
    onError,
    getFetchWidth
  })
  cbRef.current = {
    onChapterChange,
    onPrefetch,
    onLoginRequired,
    onError,
    getFetchWidth
  }

  const initedRef = useRef(false)
  const lastRangeKeyRef = useRef('')

  const resolveWidth = (): number => {
    const fn = cbRef.current.getFetchWidth
    if (fn) {
      const w = fn()
      if (w > 0) return w
    }
    return getReaderContentWidthFallback()
  }

  const prefetchOptions = () => ({
    isLoggedIn,
    feeChapterId: paidChapterStart ?? null
  })

  const emitCenterAccess = (centerId: number) => {
    const centerAcc = chapterAccessRef.current[Number(centerId)]
    if (centerAcc) {
      if (centerAcc.needLogin) cbRef.current.onLoginRequired?.('auth')
      else if (centerAcc.needPurchase) cbRef.current.onLoginRequired?.('paid')
    }
  }

  const requestMissingChapters = (centerId: number, missing: number[], order: number[]) => {
    const width = resolveWidth()
    patchBuffer({ loading: true })
    cbRef.current.onChapterChange?.(centerId, width)
    cbRef.current.onPrefetch?.(missing.length ? missing : order, width)
  }

  /** 邻居章合并进 buffer（preserveAnchor → silentExpand，对齐 Vue mergeNeighborContentsIntoBuffer）。 */
  const mergeNeighborContentsIntoBuffer = (
    centerId: number,
    pageIndexInChapter: number,
    neighborContents: Record<number, FetchedChapterContent>,
    options: { preserveAnchor?: boolean } = {}
  ) => {
    const state = useReadingStore.getState()
    const preserveAnchor =
      options.preserveAnchor ?? shouldPreserveAnchor(state.bufferReady, state.buffer, centerId)
    const rawOrder = computeBufferRange(chapterListRef.current, centerId, CHAPTER_BUFFER_RADIUS)
    const blocked = buildBlockedMap(chapterAccessRef.current, rawOrder)
    const order = filterBlockedChapterOrder(rawOrder, blocked, prefetchOptions())
    const merged = mergeBufferContents(state.buffer, order, neighborContents)
    const pageStride = preserveAnchor
      ? resolvePageStride(state.measuredContentWidth, state.pageStride)
      : 0

    const expandedBuffer: ChapterBuffer = {
      ...state.buffer,
      order: merged.order,
      segments: merged.segments,
      loading: false,
      silentExpand: preserveAnchor
    }

    if (!preserveAnchor) {
      rebuildSegmentOffsets(expandedBuffer, 0)
      expandedBuffer.silentExpand = false
      setBuffer(expandedBuffer)
      const totalPages = Math.max(1, expandedBuffer.totalPages || 1)
      const nextGlobal = clampPageIndex(
        localToGlobal(centerId, pageIndexInChapter, expandedBuffer),
        totalPages
      )
      setGlobalPageIndex(nextGlobal)
      return
    }

    rebuildSegmentOffsets(expandedBuffer, pageStride)
    setBuffer(expandedBuffer)
    const totalPages = Math.max(1, expandedBuffer.totalPages || 1)
    const nextGlobal = clampPageIndex(
      localToGlobal(centerId, pageIndexInChapter, expandedBuffer),
      totalPages
    )
    setGlobalPageIndex(nextGlobal)
  }

  /** 窗口滑动 rebalance（对齐 Vue ensureChapterBuffer，不含 fetch）。 */
  const ensureBuffer = () => {
    if (!chapterListRef.current.length) return

    const state = useReadingStore.getState()
    const centerId = state.chapterId
    const anchorChapterId = state.chapterId
    const anchorPageIndex = state.pageIndex
    const currentBuffer = state.buffer
    const rawOrder = computeBufferRange(chapterListRef.current, centerId, CHAPTER_BUFFER_RADIUS)
    const blocked = buildBlockedMap(chapterAccessRef.current, rawOrder)
    const nextOrder = filterBlockedChapterOrder(rawOrder, blocked, prefetchOptions())
    const missingIds = getMissingBufferIds(currentBuffer, nextOrder, blocked, prefetchOptions())
    const preserveAnchor = shouldPreserveAnchor(state.bufferReady, currentBuffer, centerId)
    const contents = collectReadyContents(chaptersRef.current, nextOrder)

    if (missingIds.length) {
      if (preserveAnchor) {
        mergeNeighborContentsIntoBuffer(centerId, anchorPageIndex, contents, { preserveAnchor: true })
        const stillMissing = getMissingBufferIds(
          useReadingStore.getState().buffer,
          nextOrder,
          blocked,
          prefetchOptions()
        )
        if (stillMissing.length) {
          requestMissingChapters(centerId, stillMissing, nextOrder)
        }
      } else {
        requestMissingChapters(centerId, missingIds, nextOrder)
      }
      emitCenterAccess(centerId)
      return
    }

    const orderUnchanged =
      nextOrder.length === currentBuffer.order.length &&
      nextOrder.every((id, index) => Number(id) === Number(currentBuffer.order[index]))
    if (orderUnchanged) return

    const filteredSegments: Record<number, (typeof currentBuffer.segments)[number]> = {}
    nextOrder.forEach((id) => {
      const segment = currentBuffer.segments[id]
      if (segment) filteredSegments[id] = segment
    })

    const nextBuffer: ChapterBuffer = {
      ...currentBuffer,
      order: [...nextOrder],
      segments: filteredSegments,
      loading: false,
      silentExpand: false
    }
    rebuildSegmentOffsets(nextBuffer, 0)

    const totalPages = Math.max(1, nextBuffer.totalPages || 1)
    const nextGlobal = clampPageIndex(
      localToGlobal(anchorChapterId, anchorPageIndex, nextBuffer),
      totalPages
    )
    setBuffer(nextBuffer)
    setGlobalPageIndex(nextGlobal)
    emitCenterAccess(centerId)
  }

  // 初始化组装 buffer（中心章 + 邻居）
  const assemble = (centerId: number, pageIndexInChapter = 0): ChapterBuffer => {
    const width = resolveWidth()
    const rawOrder = computeBufferRange(chapterListRef.current, centerId, CHAPTER_BUFFER_RADIUS)
    const blocked = buildBlockedMap(chapterAccessRef.current, rawOrder)
    const order = filterBlockedChapterOrder(rawOrder, blocked, prefetchOptions())
    const contents = collectReadyContents(chaptersRef.current, order)
    const prevBuffer = useReadingStore.getState().buffer
    const merged = mergeBufferContents(prevBuffer, order, contents)
    const nextBuffer: ChapterBuffer = {
      ...prevBuffer,
      order: merged.order,
      segments: merged.segments,
      loading: false,
      silentExpand: false
    }
    rebuildSegmentOffsets(nextBuffer, 0)

    const missing = getMissingBufferIds(nextBuffer, order, blocked, prefetchOptions())
    if (missing.length) {
      requestMissingChapters(centerId, missing, order)
    } else {
      cbRef.current.onPrefetch?.(order, width)
    }

    emitCenterAccess(centerId)

    setBuffer(nextBuffer)
    const segment = nextBuffer.segments[centerId]
    const pageCount = Math.max(1, segment?.pageCount || 1)
    const safePage = Math.min(pageCount - 1, Math.max(0, pageIndexInChapter))
    setGlobalPageIndex(localToGlobal(centerId, safePage, nextBuffer))
    void bookId
    return nextBuffer
  }

  const rebalance = (centerId?: number) => {
    const target = centerId ?? useReadingStore.getState().chapterId
    if (!chapterListRef.current.length) return
    assemble(target, 0)
  }

  /** 对齐 Vue goChapter(chapterId) → rebuildChapterBuffer：以目标章为中心重建 buffer 窗口。 */
  const jumpToChapter = (centerId: number, pageIndexInChapter = 0) => {
    const id = Number(centerId)
    if (!id || !chapterListRef.current.length) return

    clearNavTarget()
    resetForChapterSwitch(id)
    setNeighborPreloadStarted(false)

    const rawOrder = computeBufferRange(chapterListRef.current, id, CHAPTER_BUFFER_RADIUS)
    const blocked = buildBlockedMap(chapterAccessRef.current, rawOrder)
    const order = filterBlockedChapterOrder(rawOrder, blocked, prefetchOptions())
    lastRangeKeyRef.current = order.join(',')

    assemble(id, pageIndexInChapter)
  }

  useEffect(() => {
    registerEnsureBuffer(ensureBuffer)
    registerGoChapter(jumpToChapter)
    return () => {
      registerEnsureBuffer(null)
      registerGoChapter(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, paidChapterStart])

  useEffect(() => {
    return () => clearBufferRebalanceBridge()
  }, [])

  // 1) 初始化：chapterList 首次可用时建立 buffer
  useEffect(() => {
    if (initedRef.current || !chapterList.length) return
    initedRef.current = true
    const startId =
      Number(initialChapterId) || Number(chapterList[0].id) || 0
    resetForChapterSwitch(startId)
    setBufferReady(false)
    // 首屏遮罩依赖；每次新建 buffer 重置，等分页 + initialPosition 无动画还原后再揭开
    useReadingStore.setState({ initialLayoutSettled: false, bootContentReady: false })
    const rawOrder = computeBufferRange(chapterList, startId, CHAPTER_BUFFER_RADIUS)
    lastRangeKeyRef.current = filterBlockedChapterOrder(
      rawOrder,
      buildBlockedMap(chapterAccess, rawOrder),
      prefetchOptions()
    ).join(',')
    assemble(startId, 0)
    setBufferReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterList.length])

  // 2) chapters prop 更新：合并新章节进 buffer（preserveAnchor + silentExpand）
  useEffect(() => {
    if (!initedRef.current || !chapterList.length) return
    const state = useReadingStore.getState()
    const centerId = state.chapterId
    const prevBuffer = state.buffer
    const rawOrder = computeBufferRange(chapterList, centerId, CHAPTER_BUFFER_RADIUS)
    const blocked = buildBlockedMap(chapterAccess, rawOrder)
    const order = filterBlockedChapterOrder(rawOrder, blocked, prefetchOptions())
    const rangeKey = order.join(',')
    if (rangeKey === lastRangeKeyRef.current) {
      const contents = collectReadyContents(chapters, order)
      const hadMissing = order.some(
        (id) => !isSegmentReady(prevBuffer.segments[Number(id)]) && !blocked[Number(id)]
      )
      if (!hadMissing) return
      mergeNeighborContentsIntoBuffer(centerId, state.pageIndex, contents, { preserveAnchor: true })
      return
    }
    lastRangeKeyRef.current = rangeKey
    scheduleBufferRebalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, chapterList, chapterAccess])

  // 3) chapterId 变化（翻页跨章）：逼近边缘则 debounce rebalance（对齐 Vue scheduleEnsureBuffer）
  useEffect(() => {
    if (!initedRef.current || !chapterList.length) return
    const state = useReadingStore.getState()
    if (shouldRebalanceBuffer(state.buffer.order, state.chapterId)) {
      scheduleBufferRebalance()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterIdRef])

  // 4) 加载态：error → onError
  useEffect(() => {
    if (!chapterLoadStates) return
    Object.keys(chapterLoadStates).forEach((key) => {
      if (chapterLoadStates[Number(key)] === 'error') {
        cbRef.current.onError?.({
          scope: 'chapter',
          message: `章节 ${key} 加载失败`
        })
      }
    })
  }, [chapterLoadStates])

  return { rebalance }
}

export { getAdjacentChapterId, shouldSkipPaidPrefetch } from '../core/chapter-buffer'
