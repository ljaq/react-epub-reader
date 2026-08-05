/**
 * core/pages 页解析单测（phase-10）。
 *
 * 覆盖 resolvePageSurface：章内页 / 跨章页 / 首末页与越界 / 空 buffer；
 * resolveAdjacentPageSurface：相邻页存在与首末页 null；
 * isSameChapterPage：克隆源选择依据。
 */
import { describe, it, expect } from 'vitest'
import {
  isSameChapterPage,
  resolveAdjacentPageSurface,
  resolvePageSurface
} from '../pages'
import {
  createEmptyBuffer,
  rebuildSegmentOffsets,
  type ChapterBuffer
} from '../chapter-buffer'

/** buffer: 章10(3页) + 章11(2页) + 章12(4页)，totalPages=9 */
function makeBuffer(): ChapterBuffer {
  const buffer = createEmptyBuffer()
  buffer.order = [10, 11, 12]
  buffer.segments = {
    10: { chapterId: 10, html: 'a', content: null, pageCount: 3, widthPx: 0, offsetPages: 0 },
    11: { chapterId: 11, html: 'b', content: null, pageCount: 2, widthPx: 0, offsetPages: 0 },
    12: { chapterId: 12, html: 'c', content: null, pageCount: 4, widthPx: 0, offsetPages: 0 }
  }
  rebuildSegmentOffsets(buffer, 0)
  return buffer
}

describe('resolvePageSurface', () => {
  it('章内页：globalPageIndex 解析为 {chapterId, localPageIndex}', () => {
    const buffer = makeBuffer()
    expect(resolvePageSurface(0, buffer)).toEqual({
      key: '10:0',
      chapterId: 10,
      localPageIndex: 0,
      globalPageIndex: 0
    })
    expect(resolvePageSurface(2, buffer)).toMatchObject({ chapterId: 10, localPageIndex: 2 })
  })

  it('跨章页：章首/章末边界解析正确', () => {
    const buffer = makeBuffer()
    // 章11 首页 = 全局 3；章11 末页 = 全局 4；章12 首页 = 全局 5
    expect(resolvePageSurface(3, buffer)).toMatchObject({ chapterId: 11, localPageIndex: 0 })
    expect(resolvePageSurface(4, buffer)).toMatchObject({ chapterId: 11, localPageIndex: 1 })
    expect(resolvePageSurface(5, buffer)).toMatchObject({ chapterId: 12, localPageIndex: 0 })
    // 末章末页 = 全局 8
    expect(resolvePageSurface(8, buffer)).toMatchObject({ chapterId: 12, localPageIndex: 3 })
  })

  it('首末页之外越界 → null（无相邻页，阻尼分支）', () => {
    const buffer = makeBuffer()
    expect(resolvePageSurface(-1, buffer)).toBeNull()
    expect(resolvePageSurface(9, buffer)).toBeNull()
    expect(resolvePageSurface(100, buffer)).toBeNull()
  })

  it('空 buffer / 无 order → null', () => {
    expect(resolvePageSurface(0, createEmptyBuffer())).toBeNull()
  })

  it('非法输入 → null', () => {
    const buffer = makeBuffer()
    expect(resolvePageSurface(Number.NaN, buffer)).toBeNull()
  })
})

describe('resolveAdjacentPageSurface', () => {
  it('章内相邻页', () => {
    const buffer = makeBuffer()
    const cur = resolvePageSurface(1, buffer)!
    expect(resolveAdjacentPageSurface(cur, 1, buffer)).toMatchObject({
      chapterId: 10,
      localPageIndex: 2
    })
    expect(resolveAdjacentPageSurface(cur, -1, buffer)).toMatchObject({
      chapterId: 10,
      localPageIndex: 0
    })
  })

  it('跨章相邻页：章末→下一章首页、章首→上一章末页', () => {
    const buffer = makeBuffer()
    const ch10Last = resolvePageSurface(2, buffer)!
    expect(resolveAdjacentPageSurface(ch10Last, 1, buffer)).toMatchObject({
      chapterId: 11,
      localPageIndex: 0
    })
    const ch11First = resolvePageSurface(3, buffer)!
    expect(resolveAdjacentPageSurface(ch11First, -1, buffer)).toMatchObject({
      chapterId: 10,
      localPageIndex: 2
    })
  })

  it('首页无上一页 / 末页无下一页 → null', () => {
    const buffer = makeBuffer()
    const first = resolvePageSurface(0, buffer)!
    expect(resolveAdjacentPageSurface(first, -1, buffer)).toBeNull()
    const last = resolvePageSurface(8, buffer)!
    expect(resolveAdjacentPageSurface(last, 1, buffer)).toBeNull()
  })
})

describe('isSameChapterPage', () => {
  it('同章不同页为 true，跨章为 false', () => {
    const buffer = makeBuffer()
    const a = resolvePageSurface(1, buffer)!
    const b = resolvePageSurface(2, buffer)!
    const c = resolvePageSurface(3, buffer)!
    expect(isSameChapterPage(a, b)).toBe(true)
    expect(isSameChapterPage(a, c)).toBe(false)
  })
})
