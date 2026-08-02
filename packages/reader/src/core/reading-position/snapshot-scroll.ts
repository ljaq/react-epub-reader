/**
 * 阅读位置 — 滚动还原（scrollToDomPosTextPosition / applyNavTarget）。
 *
 * 源码对照：old-vue-reader/utils/reading-position.js 中对应函数。
 */

import { localToGlobal, type ChapterBuffer } from '../chapter-buffer'
import { getReaderContentWidth } from '../reader-viewport'
import { getParagraphIndexFromDomPos } from './pos-info'
import type { NavTarget } from './nav-target'
import {
  applyDomPosScroll,
  applyPrecentScroll,
  resolveHorizontalPageFromDomPos,
  scrollRangeIntoView,
  scrollRootToRect,
  scrollToSummaryMatch,
  splitDomPos,
  traverseDomPosNode
} from './dom-match'

function resolveHorizontalScrollPageWidth(pageWidth: number, viewportEl: Element | null): number {
  if (Number(pageWidth) > 0) {
    return Number(pageWidth)
  }
  return getReaderContentWidth(viewportEl)
}

interface ScrollHorizontalToDomPosInput {
  bodyEl: Element
  domPos: string
  textIdx: number
  pageWidth: number
  viewportEl: HTMLElement | null
  chapterId: number
  chapterBuffer: ChapterBuffer
  setGlobalPageIndex: (index: number) => void
}

function scrollHorizontalToDomPos({
  bodyEl,
  domPos,
  textIdx,
  pageWidth,
  viewportEl,
  chapterId,
  chapterBuffer,
  setGlobalPageIndex
}: ScrollHorizontalToDomPosInput): boolean {
  const resolvedPageWidth = resolveHorizontalScrollPageWidth(pageWidth, viewportEl)
  if (!resolvedPageWidth || typeof setGlobalPageIndex !== 'function') {
    return false
  }

  const pageIndex = resolveHorizontalPageFromDomPos(bodyEl, `${domPos}#${textIdx}`, resolvedPageWidth)
  if (pageIndex === null) {
    return false
  }

  setGlobalPageIndex(localToGlobal(chapterId, pageIndex, chapterBuffer))
  return true
}

function scrollVerticalToDomPosHit(rootEl: HTMLElement, hit: { node: Node; textIdx: number }): boolean {
  if (!rootEl || !hit) {
    return false
  }
  const { node, textIdx: offset } = hit
  if (node.nodeType === Node.TEXT_NODE) {
    return scrollRangeIntoView(node, offset, rootEl)
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return scrollRootToRect(rootEl, (node as Element).getBoundingClientRect())
  }
  return false
}

export interface ScrollToDomPosTextPositionInput {
  bodyEl: Element | null
  rootEl: HTMLElement | null
  domPos: string
  textIdx: number
  horizontal: boolean
  pageWidth: number
  chapterId: number
  chapterBuffer: ChapterBuffer
  setGlobalPageIndex: (index: number) => void
}

/**
 * 滚动到 domPos+textIdx 指定位置：横划算页码后 setGlobalPageIndex(localToGlobal)，
 * 竖滚滚动到对应字符/段落。chapterBuffer/setGlobalPageIndex 由 Phase 2 hooks 注入。
 * 对齐 Vue reading-position.js:967。
 */
export function scrollToDomPosTextPosition({
  bodyEl,
  rootEl,
  domPos,
  textIdx,
  horizontal,
  pageWidth,
  chapterId,
  chapterBuffer,
  setGlobalPageIndex
}: ScrollToDomPosTextPositionInput): boolean {
  if (!bodyEl || !domPos) {
    return false
  }
  const hit = traverseDomPosNode(bodyEl, `${domPos}#${textIdx}`)
  if (!hit) {
    return false
  }
  if (horizontal) {
    return scrollHorizontalToDomPos({
      bodyEl,
      domPos,
      textIdx,
      pageWidth,
      viewportEl: rootEl,
      chapterId,
      chapterBuffer,
      setGlobalPageIndex
    })
  }
  return scrollVerticalToDomPosHit(rootEl as HTMLElement, hit)
}

function scrollVerticalByH5PageY(rootEl: HTMLElement | null, navTarget: NavTarget): boolean {
  if (!Number.isFinite(navTarget.h5PageY) || !rootEl) {
    return false
  }
  rootEl.scrollTop = Math.max(0, Number(navTarget.h5PageY))
  return true
}

function createEmptyBufferProxy(): ChapterBuffer {
  return {
    order: [],
    segments: {},
    totalPages: 1,
    totalWidthPx: 0,
    loading: false,
    silentExpand: false
  }
}

function scrollVerticalByDomPosText({
  rootEl,
  bodyEl,
  navTarget
}: {
  rootEl: HTMLElement | null
  bodyEl: Element
  navTarget: NavTarget
}): boolean {
  if (!navTarget.domPos || !bodyEl || !rootEl) {
    return false
  }
  const { domPosBase, curTextIdx } = splitDomPos(navTarget.domPos)
  const textIdx = Number.isFinite(navTarget.textIdx) ? (navTarget.textIdx as number) : curTextIdx
  return scrollToDomPosTextPosition({
    bodyEl,
    rootEl,
    domPos: domPosBase,
    textIdx,
    horizontal: false,
    pageWidth: 0,
    chapterId: 0,
    chapterBuffer: createEmptyBufferProxy(),
    setGlobalPageIndex: () => {}
  })
}

function scrollVerticalNavTargetFallback({
  rootEl,
  bodyEl,
  navTarget
}: {
  rootEl: HTMLElement | null
  bodyEl: Element
  navTarget: NavTarget
}): boolean {
  if (navTarget.summary && scrollToSummaryMatch(bodyEl, rootEl as HTMLElement, navTarget.summary)) {
    return true
  }
  if (applyDomPosScroll(bodyEl, navTarget.domPos || '', rootEl as HTMLElement, getParagraphIndexFromDomPos)) {
    return true
  }
  if (Number.isFinite(navTarget.precent) && rootEl) {
    return applyPrecentScroll(rootEl, Number(navTarget.precent))
  }
  return false
}

function resolveNavTargetPosition({
  rootEl,
  bodyEl,
  horizontal,
  navTarget
}: {
  rootEl: HTMLElement | null
  bodyEl: Element
  horizontal: boolean
  navTarget: NavTarget
}): boolean {
  if (horizontal) {
    return false
  }
  if (scrollVerticalByH5PageY(rootEl, navTarget)) {
    return true
  }
  if (scrollVerticalByDomPosText({ rootEl, bodyEl, navTarget })) {
    return true
  }
  return scrollVerticalNavTargetFallback({ rootEl, bodyEl, navTarget })
}

export interface ApplyNavTargetInput {
  rootEl: HTMLElement | null
  bodyEl: Element | null
  horizontal: boolean
  navTarget: NavTarget | null
  clearNavTarget?: (() => void) | null
}

/**
 * 应用 navTarget 定位：竖滚按 h5PageY→domPos 文本→summary 匹配→precent 顺序滚动；
 * 横划返回 false（由 Phase 2 用 resolvePageIndexFromNavTarget 翻页）。成功后 clearNavTarget。
 * 对齐 Vue reading-position.js:1143。
 */
export function applyNavTarget({ rootEl, bodyEl, horizontal, navTarget, clearNavTarget }: ApplyNavTargetInput): void {
  if (!navTarget || !bodyEl) {
    return
  }
  const applied = resolveNavTargetPosition({ rootEl, bodyEl, horizontal, navTarget })
  if (applied && clearNavTarget) {
    clearNavTarget()
  }
}
