import { describe, it, expect } from 'vitest'
import {
  resolveGoChapterInitialPageIndex,
  resolvePageIndexFromNavTarget,
  parseReadPositionSummary,
  isDomPosOnlyNavTarget,
  isNavTargetPaginationReady,
  buildNavTargetFromLineItem,
  buildNavTargetFromNoteItem,
  buildNavTargetFromBookmarkItem
} from '../reading-position'
import { findBookmarkAtSnapshot, precentToPageIndex, normalizeDomPosBase } from '../bookmark-match'
import { getChapterNavFlags, wrapChapterHtmlWithNav } from '../chapter-nav'
import { getReaderContentWidthFallback, HORIZONTAL_VIEWPORT_PADDING_X, resolveChapterFetchWidth } from '../reader-viewport'

describe('reading-position navTarget', () => {
  it('resolveGoChapterInitialPageIndex 信任 saved cur', () => {
    expect(resolveGoChapterInitialPageIndex(null, 5)).toBe(0)
    expect(resolveGoChapterInitialPageIndex({ cur: 3 }, 10)).toBe(3)
    expect(resolveGoChapterInitialPageIndex({ cur: 99 }, 5)).toBe(4) // clamp
  })

  it('resolvePageIndexFromNavTarget 无 navTarget → 0', () => {
    expect(resolvePageIndexFromNavTarget(null, 5)).toBe(0)
  })

  it('resolvePageIndexFromNavTarget 信任 saved cur（savedTotal 满足）', () => {
    expect(resolvePageIndexFromNavTarget({ cur: 2, totalPage: 5 }, 5)).toBe(2)
  })

  it('resolvePageIndexFromNavTarget savedTotal 未达 → fallback precent', () => {
    // savedTotal=5 但 count=3 → isSavedNavTargetPaginationReady: count>=savedTotal? 3>=5 false → 走 fallback
    // fallback: 无 strIdx/bodyEl → precent? 无 → paragraphIndex? domPos '0=1=2=0#0' → paragraphIndex=2 → ratio 2/24
    const r = resolvePageIndexFromNavTarget({ cur: 2, totalPage: 5, domPos: '0=1=2=0#0' }, 3)
    expect(r).toBe(Math.round((2 / 24) * 2))
  })

  it('parseReadPositionSummary 解析 openwap summary', () => {
    const summary = JSON.stringify({
      chapterId: 3,
      domPos: '0=1=7=0',
      curTextIdx: 5,
      summary: '生态',
      cur: 2,
      totalPage: 5,
      isLastPage: false
    })
    const nav = parseReadPositionSummary(summary, 3)!
    expect(nav.chapterId).toBe(3)
    expect(nav.domPos).toBe('0=1=7=0#5')
    expect(nav.cur).toBe(2)
    expect(nav.totalPage).toBe(5)
    expect(nav.precent).toBe(2 / 4)
  })

  it('parseReadPositionSummary 空串 → null', () => {
    expect(parseReadPositionSummary('', 3)).toBeNull()
    expect(parseReadPositionSummary('not json', 3)).toBeNull()
  })

  it('isDomPosOnlyNavTarget', () => {
    expect(isDomPosOnlyNavTarget({ domPos: '0=1=0=0#0' })).toBe(true)
    expect(isDomPosOnlyNavTarget({ domPos: '0=1=0=0#0', cur: 1 })).toBe(false)
    expect(isDomPosOnlyNavTarget(null)).toBe(false)
    expect(isDomPosOnlyNavTarget({ domPos: 'abc' })).toBe(false)
  })

  it('isNavTargetPaginationReady', () => {
    expect(isNavTargetPaginationReady(null, 1)).toBe(true)
    // 仅 domPos → count>1
    expect(isNavTargetPaginationReady({ domPos: '0=1=0=0#0' }, 1)).toBe(false)
    expect(isNavTargetPaginationReady({ domPos: '0=1=0=0#0' }, 3)).toBe(true)
  })

  it('buildNavTargetFromLineItem / NoteItem', () => {
    const line = buildNavTargetFromLineItem({
      chapterId: 3,
      posInfo: { '0=1=7=0#5': 22312, '0=1=7=0#10': 21561 },
      summary: '生态',
      webLineId: 'er1'
    })!
    expect(line.chapterId).toBe(3)
    expect(line.webLineId).toBe('er1')
    expect(line.domPos).toBe('0=1=7=0#5')

    const note = buildNavTargetFromNoteItem({
      chapterId: 3,
      posInfo: { '0=1=7=0#5': 22312 },
      summary: '生态'
    })!
    expect(note.webLineId).toBeUndefined()
  })

  it('buildNavTargetFromBookmarkItem', () => {
    const summary = JSON.stringify({ domPos: '0=1=0=0#0', precent: 0.5, summary: 'x', strIdx: 3, cur: 2, totalPage: 5 })
    const nav = buildNavTargetFromBookmarkItem({ id: '000300003', chapterId: 3, summary })!
    expect(nav.chapterId).toBe(3)
    expect(nav.strIdx).toBe(3)
    expect(nav.cur).toBe(2)
  })
})

describe('bookmark-match', () => {
  const bookmarks = [
    { id: 'b1', chapterId: 3, domPos: '0=1=0=0#0', precent: 0.5, cur: 2, totalPage: 5, strIdx: 0 },
    { id: 'b2', chapterId: 3, domPos: '0=1=2=0#0', precent: 0.8, cur: 4, totalPage: 5, strIdx: 0 }
  ]

  it('normalizeDomPosBase', () => {
    expect(normalizeDomPosBase('0=1=2=0#5')).toBe('0=1=2=0')
    expect(normalizeDomPosBase('')).toBe('')
  })

  it('precentToPageIndex', () => {
    expect(precentToPageIndex(0, 5)).toBe(0)
    expect(precentToPageIndex(1, 5)).toBe(4)
    expect(precentToPageIndex(0.5, 5)).toBe(2)
    expect(precentToPageIndex(0.5, 1)).toBe(0)
  })

  it('findBookmarkAtSnapshot 横划按 pageIndex', () => {
    const r = findBookmarkAtSnapshot(bookmarks, null, { horizontal: true, pageCount: 5, pageIndex: 4 })
    expect(r?.id).toBe('b2')
    expect(findBookmarkAtSnapshot(bookmarks, null, { horizontal: true, pageCount: 5, pageIndex: 2 })?.id).toBe('b1')
    expect(findBookmarkAtSnapshot(bookmarks, null, { horizontal: true, pageCount: 5, pageIndex: 0 })).toBeNull()
  })

  it('findBookmarkAtSnapshot 竖滚按 domPos + precent', () => {
    const r = findBookmarkAtSnapshot(bookmarks, { domPos: '0=1=0=0#0', precent: 0.5 })
    expect(r?.id).toBe('b1')
    expect(findBookmarkAtSnapshot(bookmarks, { domPos: '0=1=9=0#0' })).toBeNull()
    expect(findBookmarkAtSnapshot([], { domPos: 'x' })).toBeNull()
  })
})

describe('chapter-nav', () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }]
  it('getChapterNavFlags', () => {
    expect(getChapterNavFlags(list, 2)).toEqual({ index: 1, hasPrev: true, hasNext: true })
    expect(getChapterNavFlags(list, 1)).toEqual({ index: 0, hasPrev: false, hasNext: true })
    expect(getChapterNavFlags(list, 3)).toEqual({ index: 2, hasPrev: true, hasNext: false })
    expect(getChapterNavFlags(list, 99).index).toBe(-1)
  })

  it('wrapChapterHtmlWithNav 包裹 h5_mainbody_block（源码现状：不注入按钮）', () => {
    const html = wrapChapterHtmlWithNav(list, 2, '<p>x</p>')
    expect(html).toContain('h5_mainbody_block')
    expect(html).toBe('<div class="h5_mainbody_block"><p>x</p></div>')
    // 已含 mainbody 不重复包裹
    expect(wrapChapterHtmlWithNav(list, 2, '<div class="h5_mainbody_block">y</div>')).toBe(
      '<div class="h5_mainbody_block">y</div>'
    )
  })

  it('wrapChapterHtmlWithNav LRU 缓存：重复调用与缓存淘汰下结果均正确（phase-11）', () => {
    // 同输入（即使 chapterList/chapterId 不同）走缓存，结果一致
    const raw = '<p>cache-key</p>'
    expect(wrapChapterHtmlWithNav(list, 2, raw)).toBe(wrapChapterHtmlWithNav(list, 3, raw))
    // 超容量（>8）持续写入触发淘汰路径：旧内容重包结果仍正确
    for (let i = 0; i <= 10; i++) {
      wrapChapterHtmlWithNav(list, 1, `<p>c${i}</p>`)
    }
    expect(wrapChapterHtmlWithNav(list, 1, '<p>c0</p>')).toBe(
      '<div class="h5_mainbody_block"><p>c0</p></div>'
    )
    expect(wrapChapterHtmlWithNav(list, 1, '<p>c10</p>')).toBe(
      '<div class="h5_mainbody_block"><p>c10</p></div>'
    )
  })
})

describe('reader-viewport', () => {
  it('HORIZONTAL_VIEWPORT_PADDING_X = 50', () => {
    expect(HORIZONTAL_VIEWPORT_PADDING_X).toBe(50)
  })
  it('getReaderContentWidthFallback 无 window 不适用 jsdom，jsdom 有 window 走 min(inner,inner)-32', () => {
    // jsdom 下 innerWidth/innerHeight 默认 1024x768 → min=768 → 768-32=736
    expect(getReaderContentWidthFallback()).toBe(Math.min(window.innerWidth, window.innerHeight) - 32)
  })
  it('resolveChapterFetchWidth rootEl 回退', () => {
    const root = document.createElement('div')
    Object.defineProperty(root, 'clientWidth', { value: 500, configurable: true })
    expect(resolveChapterFetchWidth({ rootEl: root })).toBe(500 - 50)
  })
  it('resolveChapterFetchWidth 最终回退', () => {
    expect(resolveChapterFetchWidth({})).toBe(getReaderContentWidthFallback())
  })
})
