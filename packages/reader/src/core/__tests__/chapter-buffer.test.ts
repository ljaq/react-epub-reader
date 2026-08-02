import { describe, it, expect } from 'vitest'
import {
  CHAPTER_BUFFER_RADIUS,
  computeBufferRange,
  computeRemovedPagesFromFront,
  createEmptyBuffer,
  filterBlockedChapterOrder,
  findChapterIndex,
  getAdjacentChapterId,
  getFirstChapterPageGlobal,
  getLastChapterPageGlobal,
  getMissingBufferIds,
  getSegmentWidthPx,
  globalToLocal,
  isSegmentReady,
  localToGlobal,
  rebuildSegmentOffsets,
  shouldRebalanceBuffer,
  shouldSkipPaidPrefetch,
  updateSegmentPageCounts
} from '../chapter-buffer'

const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]

describe('chapter-buffer', () => {
  it('CHAPTER_BUFFER_RADIUS = 1（以源码为准，非 TECH-SPEC 的 2）', () => {
    expect(CHAPTER_BUFFER_RADIUS).toBe(1)
  })

  it('createEmptyBuffer 初始态', () => {
    const b = createEmptyBuffer()
    expect(b.order).toEqual([])
    expect(b.segments).toEqual({})
    expect(b.totalPages).toBe(1)
    expect(b.totalWidthPx).toBe(0)
    expect(b.loading).toBe(false)
    expect(b.silentExpand).toBe(false)
  })

  it('findChapterIndex', () => {
    expect(findChapterIndex(list, 3)).toBe(2)
    expect(findChapterIndex(list, 99)).toBe(-1)
  })

  it('computeBufferRange radius=1 返回 center ± 1', () => {
    expect(computeBufferRange(list, 3)).toEqual([2, 3, 4])
    expect(computeBufferRange(list, 1)).toEqual([1, 2])
    expect(computeBufferRange(list, 5)).toEqual([4, 5])
    expect(computeBufferRange(list, 99)).toEqual([99])
  })

  it('computeBufferRange radius=2', () => {
    expect(computeBufferRange(list, 3, 2)).toEqual([1, 2, 3, 4, 5])
  })

  it('getAdjacentChapterId', () => {
    expect(getAdjacentChapterId(list, 3, 1)).toBe(4)
    expect(getAdjacentChapterId(list, 3, -1)).toBe(2)
    expect(getAdjacentChapterId(list, 1, -1)).toBeNull()
    expect(getAdjacentChapterId(list, 5, 1)).toBeNull()
    expect(getAdjacentChapterId(list, 99, 1)).toBeNull()
  })

  it('getSegmentWidthPx = pageCount×stride − gap；不强制 columns body 宽度', () => {
    // stride = pageWidth + gap = 398 + 40 = 438
    expect(getSegmentWidthPx(1, 438, 40)).toBe(398) // 438 - 40
    expect(getSegmentWidthPx(3, 438, 40)).toBe(3 * 438 - 40) // 1274
  })

  it('shouldSkipPaidPrefetch 未登录 + feeChapterId', () => {
    expect(shouldSkipPaidPrefetch(5, { isLoggedIn: false, feeChapterId: 3 })).toBe(true)
    expect(shouldSkipPaidPrefetch(2, { isLoggedIn: false, feeChapterId: 3 })).toBe(false)
    expect(shouldSkipPaidPrefetch(5, { isLoggedIn: true, feeChapterId: 3 })).toBe(false)
    expect(shouldSkipPaidPrefetch(5, { isLoggedIn: false, feeChapterId: null })).toBe(false)
  })

  it('filterBlockedChapterOrder 过滤 blocked + paid', () => {
    expect(filterBlockedChapterOrder([1, 2, 3, 4], { 2: true })).toEqual([1, 3, 4])
    // 未登录 + feeChapterId=3：chapterId>=3 跳过 → [1,2]
    expect(
      filterBlockedChapterOrder([1, 2, 3, 4], {}, { isLoggedIn: false, feeChapterId: 3 })
    ).toEqual([1, 2])
  })

  it('isSegmentReady', () => {
    expect(isSegmentReady({ html: 'x', chapterId: 1, content: {}, pageCount: 1, widthPx: 0, offsetPages: 0 })).toBe(true)
    expect(isSegmentReady({ html: '', chapterId: 1, content: {}, pageCount: 1, widthPx: 0, offsetPages: 0 })).toBe(false)
    expect(isSegmentReady(null)).toBe(false)
  })

  it('getMissingBufferIds', () => {
    const b = createEmptyBuffer()
    b.segments[1] = { chapterId: 1, html: 'x', content: {}, pageCount: 1, widthPx: 0, offsetPages: 0 }
    expect(getMissingBufferIds(b, [1, 2, 3])).toEqual([2, 3])
    expect(getMissingBufferIds(b, [1, 2], { 2: true })).toEqual([])
  })

  it('rebuildSegmentOffsets / updateSegmentPageCounts / globalToLocal / localToGlobal', () => {
    const b = createEmptyBuffer()
    b.order = [1, 2]
    b.segments[1] = { chapterId: 1, html: 'a', content: {}, pageCount: 3, widthPx: 0, offsetPages: 0 }
    b.segments[2] = { chapterId: 2, html: 'b', content: {}, pageCount: 2, widthPx: 0, offsetPages: 0 }
    rebuildSegmentOffsets(b, 438)
    expect(b.segments[1].offsetPages).toBe(0)
    expect(b.segments[2].offsetPages).toBe(3)
    expect(b.totalPages).toBe(5)
    expect(b.segments[1].widthPx).toBe(getSegmentWidthPx(3, 438, 40))
    expect(b.totalWidthPx).toBe(getSegmentWidthPx(3, 438, 40) + getSegmentWidthPx(2, 438, 40))

    expect(localToGlobal(1, 0, b)).toBe(0)
    expect(localToGlobal(2, 0, b)).toBe(3)
    expect(localToGlobal(2, 1, b)).toBe(4)
    expect(localToGlobal(99, 0, b)).toBe(0)

    expect(globalToLocal(0, b)).toEqual({ chapterId: 1, pageIndex: 0 })
    expect(globalToLocal(2, b)).toEqual({ chapterId: 1, pageIndex: 2 })
    expect(globalToLocal(3, b)).toEqual({ chapterId: 2, pageIndex: 0 })
    expect(globalToLocal(4, b)).toEqual({ chapterId: 2, pageIndex: 1 })
    expect(globalToLocal(99, b)).toEqual({ chapterId: 2, pageIndex: 1 })

    updateSegmentPageCounts(b, { '1': 5 }, 438)
    expect(b.segments[1].pageCount).toBe(5)
    expect(b.totalPages).toBe(7)
  })

  it('shouldRebalanceBuffer', () => {
    expect(shouldRebalanceBuffer([], 1)).toBe(true)
    expect(shouldRebalanceBuffer([1, 2, 3], 2)).toBe(false)
    expect(shouldRebalanceBuffer([1, 2, 3], 1)).toBe(true)
    expect(shouldRebalanceBuffer([1, 2, 3], 3)).toBe(true)
    expect(shouldRebalanceBuffer([1, 2, 3], 99)).toBe(true)
  })

  it('computeRemovedPagesFromFront', () => {
    const segs = {
      1: { chapterId: 1, html: '', content: {}, pageCount: 3, widthPx: 0, offsetPages: 0 },
      2: { chapterId: 2, html: '', content: {}, pageCount: 2, widthPx: 0, offsetPages: 0 }
    }
    expect(computeRemovedPagesFromFront([1, 2, 3], [2, 3], segs)).toBe(3)
    expect(computeRemovedPagesFromFront([1, 2], [1, 2], segs)).toBe(0)
  })

  it('getFirstChapterPageGlobal / getLastChapterPageGlobal', () => {
    const b = createEmptyBuffer()
    b.order = [1]
    b.segments[1] = { chapterId: 1, html: '', content: {}, pageCount: 4, widthPx: 0, offsetPages: 5 }
    expect(getFirstChapterPageGlobal(b)).toBe(0)
    expect(getLastChapterPageGlobal(1, b)).toBe(8)
    expect(getLastChapterPageGlobal(99, b)).toBe(0)
  })
})
