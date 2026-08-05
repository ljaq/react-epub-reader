/**
 * 阅读位置 — 阅读快照构造（buildReadPositionPayload / buildReadingSnapshot）。
 *
 * 源码对照：old-vue-reader/utils/reading-position.js 中对应函数。
 */

import { getParagraphIndexFromDomPos } from './pos-info'
import {
  findParagraphIndex,
  getParagraphElements,
  normalizeText,
  splitDomPos
} from './dom-match'

const SUMMARY_MAX_LEN = 80
const REPORT_SUMMARY_MAX_LEN = 100

function truncateSummary(text: string, maxLen: number = SUMMARY_MAX_LEN): string {
  const normalized = normalizeText(text)
  if (normalized.length <= maxLen) {
    return normalized
  }
  return `${normalized.slice(0, maxLen)}…`
}

function truncateReportSummary(text: string, maxLen: number = REPORT_SUMMARY_MAX_LEN): string {
  const normalized = normalizeText(text)
  if (normalized.length <= maxLen) {
    return normalized
  }
  return normalized.slice(0, maxLen)
}

interface ChapterNameItem {
  id: number
  chapterName: string
}

function getChapterName(chapterList: ChapterNameItem[], chapterId: number): string {
  const chapter = (chapterList || []).find(item => Number(item.id) === Number(chapterId))
  return chapter?.chapterName || ''
}

function buildHorizontalPositionFields(
  pageIndex: number,
  pageCount: number
): { cur: number; totalPage: number; isLastPage: boolean } {
  const count = Math.max(1, Number(pageCount) || 1)
  const pageIdx = Math.min(count - 1, Math.max(0, Number(pageIndex) || 0))
  return { cur: pageIdx, totalPage: count, isLastPage: pageIdx >= count - 1 }
}

interface ReadingSnapshotInput {
  rawSummary?: string
  summary?: string
  strIdx?: number
  domPos?: string
}

function resolveReportSummary(snapshot: ReadingSnapshotInput, curTextIdx: number): string {
  const summarySource = snapshot.rawSummary || snapshot.summary || ''
  let summary = truncateReportSummary(summarySource)
  if (summary.length > REPORT_SUMMARY_MAX_LEN && curTextIdx > 0) {
    summary = truncateReportSummary(summarySource.slice(curTextIdx))
  }
  return summary
}

export interface BuildReadPositionPayloadInput {
  chapterId: number
  chapterList: ChapterNameItem[]
  snapshot: ReadingSnapshotInput | null
  horizontal: boolean
  pageIndex: number
  pageCount: number
  scrollTop?: number
}

/** 构造阅读进度上报 payload（JSON）：含 chapterName/domPos/strIdx/summary，横划加 cur/totalPage，竖滚加 h5PageY。对齐 Vue reading-position.js:318 */
export function buildReadPositionPayload({
  chapterId,
  chapterList,
  snapshot,
  horizontal,
  pageIndex,
  pageCount,
  scrollTop = 0
}: BuildReadPositionPayloadInput): string {
  const safeSnapshot = snapshot || {}
  const { domPosBase, curTextIdx } = splitDomPos(safeSnapshot.domPos)
  const payload: Record<string, unknown> = {
    chapterName: getChapterName(chapterList, chapterId),
    strIdx: Number(safeSnapshot.strIdx) || 0,
    domPos: domPosBase,
    curTextIdx,
    chapterId: Number(chapterId),
    chapterAnchorId: '',
    summary: resolveReportSummary(safeSnapshot, curTextIdx)
  }

  if (horizontal) {
    Object.assign(payload, buildHorizontalPositionFields(pageIndex, pageCount))
  } else {
    payload.h5PageY = Math.max(0, Number(scrollTop) || 0)
  }

  return JSON.stringify(payload)
}

function isRectIntersectingViewport(rect: DOMRect, viewportRect: DOMRect): boolean {
  return (
    rect.bottom > viewportRect.top &&
    rect.top < viewportRect.bottom &&
    rect.right > viewportRect.left &&
    rect.left < viewportRect.right
  )
}

function isTextBlockElement(node: Node | null): boolean {
  if (!node || (node as Element).nodeType !== Node.ELEMENT_NODE) {
    return false
  }
  const tag = (node as Element).tagName
  return tag === 'P' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'LI'
}

function findTextBlockFromPoint(bodyEl: Element, viewportEl: Element): Element | null {
  const viewportRect = viewportEl.getBoundingClientRect()
  const x = viewportRect.left + Math.min(48, viewportRect.width * 0.12)
  const y = viewportRect.top + 28

  let node: Element | null = document.elementFromPoint(x, y)
  while (node && node !== bodyEl && !bodyEl.contains(node)) {
    node = node.parentElement
  }
  while (node && node !== bodyEl) {
    if (isTextBlockElement(node)) {
      return node
    }
    node = node.parentElement
  }
  return null
}

interface VisibleContent {
  index: number
  text: string
}

function findTopVisibleParagraphInViewport(bodyEl: Element, viewportEl: Element): VisibleContent {
  const viewportRect = viewportEl.getBoundingClientRect()
  const paragraphs = getParagraphElements(bodyEl)
  if (!paragraphs.length) {
    return { index: 0, text: '' }
  }

  let best: VisibleContent | null = null
  let bestTop = Infinity

  paragraphs.forEach((para, index) => {
    const rect = para.getBoundingClientRect()
    if (!isRectIntersectingViewport(rect, viewportRect)) {
      return
    }
    if (rect.top < bestTop) {
      bestTop = rect.top
      best = { index, text: para.textContent || '' }
    }
  })

  if (best) {
    return best
  }
  return { index: 0, text: paragraphs[0].textContent || '' }
}

function findVisibleContentAtViewportTop(bodyEl: Element, viewportEl: Element): VisibleContent {
  const textBlock = findTextBlockFromPoint(bodyEl, viewportEl)
  if (textBlock) {
    return { index: findParagraphIndex(bodyEl, textBlock), text: textBlock.textContent || '' }
  }
  return findTopVisibleParagraphInViewport(bodyEl, viewportEl)
}

interface TopVisibleParagraph {
  index: number
  element: Element | null
  text: string
}

function findTopVisibleParagraph(bodyEl: Element, viewportTop: number = 0): TopVisibleParagraph {
  const paragraphs = getParagraphElements(bodyEl)
  if (!paragraphs.length) {
    return { index: 0, element: null, text: '' }
  }

  let best: TopVisibleParagraph = { index: 0, element: paragraphs[0], text: paragraphs[0].textContent || '' }
  for (let i = 0; i < paragraphs.length; i += 1) {
    const para = paragraphs[i]
    const rect = para.getBoundingClientRect()
    if (rect.bottom >= viewportTop) {
      best = { index: i, element: para, text: para.textContent || '' }
      break
    }
    best = { index: i, element: para, text: para.textContent || '' }
  }
  return best
}

function resolveVisibleContent(
  bodyEl: Element,
  viewportEl: Element | null,
  horizontal: boolean
): TopVisibleParagraph | VisibleContent {
  if (horizontal && viewportEl) {
    return findVisibleContentAtViewportTop(bodyEl, viewportEl)
  }
  const viewportTop = (viewportEl?.getBoundingClientRect()?.top ?? 0) + 20
  return findTopVisibleParagraph(bodyEl, viewportTop)
}

function isCharVisibleInViewport(range: Range, viewportRect: DOMRect, horizontal: boolean): boolean {
  const rects = range.getClientRects()
  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i]
    if (rect.width <= 0 && rect.height <= 0) {
      continue
    }
    if (horizontal) {
      if (rect.left >= viewportRect.left && rect.left < viewportRect.right) {
        return true
      }
    } else if (rect.top >= viewportRect.top && rect.top < viewportRect.bottom) {
      return true
    }
  }
  return false
}

interface BookmarkAnchor {
  domPos: string
  summary: string
  strIdx: number
}

function computeBookmarkAnchor(
  bodyEl: Element,
  viewportEl: Element | null,
  horizontal: boolean,
  coarseHorizontal: boolean = false
): BookmarkAnchor {
  if (!bodyEl) {
    return { domPos: '0=1=0=0#0', summary: '', strIdx: 0 }
  }

  // phase-12 perf：横划高频路径（进度上报）跳过逐字符 getClientRects 扫描——
  // 该扫描成本 O(当前页之前的字符数)，页越靠后越卡；直接落下方段落级锚点。
  // 横划 payload 的恢复主键是 cur/totalPage（pageIndex/pageCount），
  // domPos/strIdx 精确到段首已足够；书签创建等低频路径保持逐字符精确扫描。
  if (coarseHorizontal && horizontal) {
    const visible = resolveVisibleContent(bodyEl, viewportEl, horizontal) as VisibleContent
    const index = visible.index
    let coarseStrIdx = 0
    getParagraphElements(bodyEl)
      .slice(0, index)
      .forEach(paragraph => {
        coarseStrIdx += (paragraph.textContent || '').length
      })
    return { domPos: `0=1=${index}=0#0`, summary: visible.text, strIdx: coarseStrIdx }
  }

  const viewportRect = (viewportEl || bodyEl).getBoundingClientRect()
  let strIdx = 0
  const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return (node as Text).textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })

  let node = walker.nextNode() as Text | null
  while (node) {
    const text = node.textContent || ''
    for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
      const range = document.createRange()
      range.setStart(node, charIndex)
      range.setEnd(node, charIndex + 1)

      if (isCharVisibleInViewport(range, viewportRect, horizontal)) {
        const paragraphIndex = findParagraphIndex(bodyEl, node)
        const paragraph = getParagraphElements(bodyEl)[paragraphIndex]
        const summary = paragraph?.textContent || text
        return { domPos: `0=1=${paragraphIndex}=0#${charIndex}`, summary, strIdx }
      }
      strIdx += 1
    }
    node = walker.nextNode() as Text | null
  }

  const visible = resolveVisibleContent(bodyEl, viewportEl, horizontal) as VisibleContent
  const index = visible.index
  let fallbackStrIdx = 0
  getParagraphElements(bodyEl)
    .slice(0, index)
    .forEach(paragraph => {
      fallbackStrIdx += (paragraph.textContent || '').length
    })

  return { domPos: `0=1=${index}=0#0`, summary: visible.text, strIdx: fallbackStrIdx }
}

function resolveChapterPrecent({
  horizontal,
  pageIndex,
  pageCount,
  rootEl
}: {
  horizontal: boolean
  pageIndex: number
  pageCount: number
  rootEl: HTMLElement | null
}): number {
  if (horizontal) {
    const count = Math.max(1, Number(pageCount) || 1)
    const precent = count <= 1 ? 0 : Number(pageIndex) / (count - 1)
    return Math.min(1, Math.max(0, precent))
  }
  if (!rootEl) {
    return 0
  }
  const maxScroll = Math.max(0, rootEl.scrollHeight - rootEl.clientHeight)
  return maxScroll > 0 ? Math.min(1, Math.max(0, rootEl.scrollTop / maxScroll)) : 0
}

export interface ReadingSnapshot {
  domPos: string
  summary: string
  rawSummary?: string
  precent: number
  strIdx: number
}

export interface BuildReadingSnapshotInput {
  rootEl: HTMLElement | null
  bodyEl: Element | null
  viewportEl?: Element | null
  horizontal: boolean
  pageIndex: number
  pageCount: number
  /** phase-12 perf：横划模式跳过逐字符扫描，锚点精确到段首（见 computeBookmarkAnchor） */
  coarseHorizontalAnchor?: boolean
}

/**
 * 构造当前阅读快照 { domPos, summary, rawSummary, precent, strIdx }：
 * 由视口首个可见字符算 domPos/strIdx，按横划 pageIndex 或竖滚 scrollTop 算 precent。
 * 对齐 Vue reading-position.js:1003。
 */
export function buildReadingSnapshot({
  rootEl,
  bodyEl,
  viewportEl,
  horizontal,
  pageIndex,
  pageCount,
  coarseHorizontalAnchor = false
}: BuildReadingSnapshotInput): ReadingSnapshot {
  if (!bodyEl) {
    return { domPos: '0=1=0=0#0', summary: '', precent: 0, strIdx: 0 }
  }

  const anchor = computeBookmarkAnchor(bodyEl, viewportEl || rootEl, horizontal, coarseHorizontalAnchor)
  const precent = resolveChapterPrecent({ horizontal, pageIndex, pageCount, rootEl })

  return {
    domPos: anchor.domPos,
    summary: truncateSummary(anchor.summary),
    rawSummary: anchor.summary,
    precent,
    strIdx: anchor.strIdx
  }
}

// 保留 getParagraphIndexFromDomPos 引用避免未使用告警（snapshot-scroll 复用）
export { getParagraphIndexFromDomPos }
