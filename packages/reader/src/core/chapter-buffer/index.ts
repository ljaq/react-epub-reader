/**
 * 章节缓冲区纯函数。
 *
 * 源码对照：old-vue-reader/store/chapter-buffer.js:1-280
 *
 * 关键常量（与 Vue 逐字对照）：
 * - CHAPTER_BUFFER_RADIUS = 1（chapter-buffer.js:3，以源码 1 为准，非 TECH-SPEC 的 2）
 */

import { clampPageIndex, PAGE_COLUMN_GAP } from '../pagination'

export const CHAPTER_BUFFER_RADIUS = 1

/** 计算 segment 的 CSS 宽度 = pageCount×stride − gap（单页时 = stride−gap = 页宽）。对齐 Vue chapter-buffer.js:5 */
export function getSegmentWidthPx(pageCount: number, pageStride: number, pageGap: number = PAGE_COLUMN_GAP): number {
  const count = Math.max(1, pageCount)
  if (count <= 1) {
    return pageStride - pageGap
  }
  return count * pageStride - pageGap
}

export interface BufferSegment {
  chapterId: number
  html: string
  content: unknown
  pageCount: number
  widthPx: number
  offsetPages: number
  offsetPx?: number
}

export interface ChapterBuffer {
  order: number[]
  segments: Record<number, BufferSegment>
  totalPages: number
  totalWidthPx: number
  loading: boolean
  silentExpand: boolean
}

/** 创建空缓冲区。totalPages 初始 1，loading/silentExpand 均 false。对齐 Vue chapter-buffer.js:13 */
export function createEmptyBuffer(): ChapterBuffer {
  return {
    order: [],
    segments: {},
    totalPages: 1,
    totalWidthPx: 0,
    loading: false,
    silentExpand: false
  }
}

export interface ChapterListItem {
  id: number
}

/** 在 chapterList 中按 id 查找序号。对齐 Vue chapter-buffer.js:24 */
export function findChapterIndex<T extends ChapterListItem>(chapterList: T[], chapterId: number): number {
  return chapterList.findIndex(item => Number(item.id) === Number(chapterId))
}

/**
 * 计算 centerId 周围 ±radius 的章节 id 列表（含 center）。
 * radius 默认 CHAPTER_BUFFER_RADIUS=1。centerId 不在列表时回退 [centerId]。
 * 对齐 Vue chapter-buffer.js:28。
 */
export function computeBufferRange<T extends ChapterListItem>(
  chapterList: T[],
  centerId: number,
  radius: number = CHAPTER_BUFFER_RADIUS
): number[] {
  const centerIndex = findChapterIndex(chapterList, centerId)
  if (centerIndex < 0) {
    return [Number(centerId)]
  }

  const start = Math.max(0, centerIndex - radius)
  const end = Math.min(chapterList.length - 1, centerIndex + radius)

  return chapterList.slice(start, end + 1).map(item => Number(item.id))
}

export interface FetchedChapterContent {
  code: number
  html: string
}

export type FetchChapterContentFn = (params: {
  bookId: number
  chapterId: number
  width: number
}) => Promise<FetchedChapterContent | null>

/**
 * 并发拉取多个章节内容（去重 + 过滤 falsy id），仅保留 code===0 的结果。
 * fetchChapterContent 由宿主注入（Phase 2 hooks 桥接 onChapterChange/预取）。
 * 对齐 Vue chapter-buffer.js:40。
 */
export async function fetchBufferChapters(
  bookId: number,
  ids: number[],
  width: number,
  fetchChapterContent: FetchChapterContentFn
): Promise<Record<number, FetchedChapterContent>> {
  const uniqueIds = [...new Set(ids.map(id => Number(id)).filter(Boolean))]
  const results = await Promise.all(
    uniqueIds.map(chapterId => fetchChapterContent({ bookId, chapterId, width }))
  )

  const contents: Record<number, FetchedChapterContent> = {}
  uniqueIds.forEach((chapterId, index) => {
    const res = results[index]
    if (res && res.code === 0) {
      contents[chapterId] = res
    }
  })

  return contents
}

/**
 * 优先拉取 center 章（await），邻居章异步拉取后回调 onNeighborContents。
 * 保证 center 章先就绪以尽快渲染，邻居章不阻塞。对齐 Vue chapter-buffer.js:55。
 */
export async function fetchBufferChaptersPrioritized(
  bookId: number,
  ids: number[],
  centerId: number,
  width: number,
  fetchChapterContent: FetchChapterContentFn,
  onNeighborContents: ((contents: Record<number, FetchedChapterContent>) => void) | null
): Promise<Record<number, FetchedChapterContent>> {
  const uniqueIds = [...new Set(ids.map(id => Number(id)).filter(Boolean))]
  const center = Number(centerId)
  const contents: Record<number, FetchedChapterContent> = {}

  if (uniqueIds.includes(center)) {
    const centerRes = await fetchChapterContent({ bookId, chapterId: center, width })
    if (centerRes && centerRes.code === 0) {
      contents[center] = centerRes
    }
  }

  const neighborIds = uniqueIds.filter(id => id !== center)
  if (neighborIds.length && typeof onNeighborContents === 'function') {
    fetchBufferChapters(bookId, neighborIds, width, fetchChapterContent)
      .then(neighborContents => {
        onNeighborContents(neighborContents)
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('[chapter-buffer] neighbor fetch failed', err)
        onNeighborContents({})
      })
  }

  return contents
}

/** segment 是否已就绪（有 html）。对齐 Vue chapter-buffer.js:90 */
export function isSegmentReady(segment: BufferSegment | null | undefined): boolean {
  return Boolean(segment && segment.html)
}

/**
 * 将拉取到的 contents 合并进 buffer.segments（保留已有 pageCount/widthPx/offsetPages）。
 * 返回新的 { order, segments }（不原地改 buffer 顶层）。对齐 Vue chapter-buffer.js:94。
 */
export function mergeBufferContents(
  buffer: ChapterBuffer,
  order: number[],
  contents: Record<number, FetchedChapterContent>
): { order: number[]; segments: Record<number, BufferSegment> } {
  const nextSegments = { ...buffer.segments }

  order.forEach(chapterId => {
    const content = contents[chapterId]
    if (!content) {
      return
    }

    const existing = nextSegments[chapterId]
    nextSegments[chapterId] = {
      chapterId,
      html: content.html || '',
      content,
      pageCount: existing ? existing.pageCount : 1,
      widthPx: existing ? existing.widthPx : 0,
      offsetPages: existing ? existing.offsetPages : 0
    }
  })

  const orderUnchanged =
    buffer.order.length === order.length &&
    buffer.order.every((id, index) => Number(id) === Number(order[index]))

  return {
    order: orderUnchanged ? buffer.order : [...order],
    segments: nextSegments
  }
}

/**
 * 重建所有 segment 的 offsetPages/offsetPx/widthPx，并刷新 buffer.totalPages/totalWidthPx。
 * pageStride=0 时只算页数不算像素（竖滚模式）。**原地修改 buffer**。对齐 Vue chapter-buffer.js:120。
 */
export function rebuildSegmentOffsets(buffer: ChapterBuffer, pageStride: number = 0): void {
  let offsetPages = 0
  let offsetPx = 0

  buffer.order.forEach(chapterId => {
    const segment = buffer.segments[chapterId]
    if (!segment) {
      return
    }

    const pageCount = Math.max(1, segment.pageCount || 1)
    segment.offsetPages = offsetPages
    segment.offsetPx = pageStride > 0 ? offsetPx : 0

    if (pageStride > 0) {
      segment.widthPx = getSegmentWidthPx(pageCount, pageStride, PAGE_COLUMN_GAP)
      offsetPx += segment.widthPx
    } else if (!segment.widthPx) {
      segment.widthPx = 0
    }

    offsetPages += pageCount
  })

  buffer.totalPages = Math.max(1, offsetPages)
  buffer.totalWidthPx = pageStride > 0 ? offsetPx : 0
}

/**
 * 更新指定章节的 pageCount（来自分页测量），随后 rebuildSegmentOffsets。
 * **原地修改 buffer**。对齐 Vue chapter-buffer.js:148。
 */
export function updateSegmentPageCounts(
  buffer: ChapterBuffer,
  pageCounts: Record<string, number>,
  pageStride: number = 0
): void {
  Object.keys(pageCounts).forEach(key => {
    const chapterId = Number(key)
    const segment = buffer.segments[chapterId]
    if (segment) {
      const pageCount = Math.max(1, Number(pageCounts[key]) || 1)
      segment.pageCount = pageCount
    }
  })
  rebuildSegmentOffsets(buffer, pageStride)
}

/**
 * 判断当前 center 章是否已逼近 buffer 边缘（需 rebalance）。
 * edgeMargin = max(0, RADIUS-1)；centerIdx ≤ edgeMargin 或 ≥ len-1-edgeMargin 时返回 true。
 * 对齐 Vue chapter-buffer.js:160。
 */
export function shouldRebalanceBuffer(bufferOrder: number[], chapterId: number): boolean {
  if (!bufferOrder.length) {
    return true
  }

  const centerIdx = bufferOrder.indexOf(Number(chapterId))
  if (centerIdx < 0) {
    return true
  }

  const edgeMargin = Math.max(0, CHAPTER_BUFFER_RADIUS - 1)
  return centerIdx <= edgeMargin || centerIdx >= bufferOrder.length - 1 - edgeMargin
}

export interface LocalPosition {
  chapterId: number
  pageIndex: number
}

/**
 * 全局页码 → { chapterId, 章内 pageIndex }。落在某 segment 的 [start,end) 内即返回；
 * 超出最后一个 segment 时 clamp 到末章末页。对齐 Vue chapter-buffer.js:174。
 */
export function globalToLocal(globalPageIndex: number, buffer: ChapterBuffer): LocalPosition {
  const safeGlobal = Math.max(0, globalPageIndex)

  for (let i = 0; i < buffer.order.length; i += 1) {
    const chapterId = buffer.order[i]
    const segment = buffer.segments[chapterId]
    if (!segment) {
      continue
    }

    const pageCount = Math.max(1, segment.pageCount || 1)
    const start = segment.offsetPages
    const end = start + pageCount

    if (safeGlobal < end || i === buffer.order.length - 1) {
      return {
        chapterId,
        pageIndex: clampPageIndex(safeGlobal - start, pageCount)
      }
    }
  }

  const fallbackId = buffer.order[0]
  return {
    chapterId: fallbackId,
    pageIndex: 0
  }
}

/** 章内 pageIndex → 全局页码 = segment.offsetPages + clampPageIndex。对齐 Vue chapter-buffer.js:203 */
export function localToGlobal(chapterId: number, pageIndex: number, buffer: ChapterBuffer): number {
  const segment = buffer.segments[Number(chapterId)]
  if (!segment) {
    return 0
  }

  const pageCount = Math.max(1, segment.pageCount || 1)
  return segment.offsetPages + clampPageIndex(pageIndex, pageCount)
}

export interface PrefetchOptions {
  isLoggedIn?: boolean
  feeChapterId?: number | null
}

/**
 * 未登录时跳过付费章预取：chapterId ≥ feeChapterId。
 * isLoggedIn 或无 feeChapterId 时不跳过。对齐 Vue chapter-buffer.js:225。
 */
export function shouldSkipPaidPrefetch(
  chapterId: number,
  { isLoggedIn = true, feeChapterId = null }: PrefetchOptions = {}
): boolean {
  if (isLoggedIn || !feeChapterId) {
    return false
  }
  return Number(chapterId) >= Number(feeChapterId)
}

/** 返回 buffer 中未就绪且未被 blocked/paid-skip 的章节 id。对齐 Vue chapter-buffer.js:213 */
export function getMissingBufferIds(
  buffer: ChapterBuffer,
  order: number[],
  blockedChapterIds: Record<number, boolean> = {},
  prefetchOptions: PrefetchOptions = {}
): number[] {
  return order.filter(chapterId => {
    if (blockedChapterIds[chapterId]) {
      return false
    }
    if (shouldSkipPaidPrefetch(chapterId, prefetchOptions)) {
      return false
    }
    return !isSegmentReady(buffer.segments[chapterId])
  })
}

/** 过滤 order 中被 blocked 与需 paid-skip 的章节。对齐 Vue chapter-buffer.js:232 */
export function filterBlockedChapterOrder(
  order: number[],
  blockedChapterIds: Record<number, boolean> = {},
  prefetchOptions: PrefetchOptions = {}
): number[] {
  return order.filter(chapterId => {
    if (blockedChapterIds[chapterId]) {
      return false
    }
    return !shouldSkipPaidPrefetch(chapterId, prefetchOptions)
  })
}

/**
 * 计算 buffer 前端被移除的章节数对应的页数（rebalance 时用于修正 globalPageIndex）。
 * 遍历 previousOrder，遇到第一个仍保留的章节即停。对齐 Vue chapter-buffer.js:241。
 */
export function computeRemovedPagesFromFront(
  previousOrder: number[],
  nextOrder: number[],
  segments: Record<number, BufferSegment>
): number {
  let removedPages = 0

  previousOrder.some(chapterId => {
    if (nextOrder.includes(chapterId)) {
      return true
    }
    removedPages += Math.max(1, segments[chapterId]?.pageCount || 1)
    return false
  })

  return removedPages
}

/** 首章首页全局页码恒为 0。对齐 Vue chapter-buffer.js:255 */
export function getFirstChapterPageGlobal(_buffer: ChapterBuffer): number {
  return 0
}

/** 指定章末页全局页码 = offsetPages + pageCount - 1。对齐 Vue chapter-buffer.js:259 */
export function getLastChapterPageGlobal(chapterId: number, buffer: ChapterBuffer): number {
  const segment = buffer.segments[Number(chapterId)]
  if (!segment) {
    return 0
  }
  const pageCount = Math.max(1, segment.pageCount || 1)
  return segment.offsetPages + pageCount - 1
}

/**
 * 取相邻章节 id。direction=1 下一章，-1 上一章；越界返回 null。
 * 对齐 Vue chapter-buffer.js:268。
 */
export function getAdjacentChapterId<T extends ChapterListItem>(
  chapterList: T[],
  chapterId: number,
  direction: number
): number | null {
  const index = findChapterIndex(chapterList, chapterId)
  if (index < 0) {
    return null
  }

  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= chapterList.length) {
    return null
  }

  return Number(chapterList[nextIndex].id)
}
