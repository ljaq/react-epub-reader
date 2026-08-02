/**
 * 阅读位置 — DOM 测量与文本匹配辅助。
 *
 * 源码对照：old-vue-reader/utils/reading-position.js 中的内部辅助函数
 * （findNormalizedMatch / findTextNodeAtOffset / scroll* / findTextHitAtStrIdx /
 *  traverseDomPosNode / resolveHorizontalPage* / getTextNodeClientRect）。
 */

import { getPageStride, PAGE_COLUMN_GAP } from '../pagination'

const SCROLL_TOP_OFFSET = 40

/** 去空白归一化文本（用于 summary 匹配）。 */
export function normalizeText(text: string): string {
  return (text || '').replace(/\s+/gu, ' ').trim()
}

/** 取 bodyEl 下所有 <p> 元素。 */
export function getParagraphElements(bodyEl: Element | null): Element[] {
  if (!bodyEl) {
    return []
  }
  return Array.from(bodyEl.querySelectorAll('p'))
}

/** 由 node 向上找所属 <p> 在 bodyEl 中的序号（domPos 段落索引）。 */
export function findParagraphIndex(bodyEl: Element, element: Node | null): number {
  if (!element || !bodyEl) {
    return 0
  }
  const paragraphs = getParagraphElements(bodyEl)
  const directIndex = paragraphs.indexOf(element as Element)
  if (directIndex >= 0) {
    return directIndex
  }

  let current: Node | null = element
  while (current && current !== bodyEl) {
    if ((current as Element).tagName === 'P') {
      return Math.max(0, paragraphs.indexOf(current as Element))
    }
    current = (current as Element).parentElement
  }
  return 0
}

export interface NormalizedMatch {
  start: number
  end: number
}

/**
 * 在 fullText 中查找 normalizedSummary 的匹配区间（O(n) 跳空白实现），
 * 还原到原始 fullText 坐标 { start, end }。用于按 summary 文本在 live DOM 中定位阅读位置。
 */
export function findNormalizedMatch(fullText: string, normalizedSummary: string): NormalizedMatch | null {
  const target = normalizeText(normalizedSummary)
  if (!target) {
    return null
  }

  const normChars: string[] = []
  const indexMap: number[] = []
  for (let i = 0; i < fullText.length; i += 1) {
    const ch = fullText[i]
    if (/\s/u.test(ch)) {
      continue
    }
    indexMap.push(i)
    normChars.push(ch)
  }

  const normTarget = target.replace(/\s+/gu, '')
  if (!normTarget) {
    return null
  }

  const normStart = normChars.join('').indexOf(normTarget)
  if (normStart < 0) {
    return null
  }

  const start = normStart === 0 ? 0 : indexMap[normStart - 1] + 1
  const lastOrigIdx = indexMap[normStart + normTarget.length - 1]
  return { start, end: lastOrigIdx + 1 }
}

export interface TextNodeHit {
  node: Text
  offset: number
}

/** 在 bodyEl 文本树中找到 matchStart 偏移所在的文本节点与节点内偏移。 */
export function findTextNodeAtOffset(bodyEl: Element, matchStart: number): TextNodeHit | null {
  const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT)
  let offset = 0
  let node = walker.nextNode() as Text | null

  while (node) {
    const nodeText = node.textContent || ''
    const nodeStart = offset
    const nodeEnd = offset + nodeText.length

    if (matchStart >= nodeStart && matchStart < nodeEnd) {
      return { node, offset: matchStart - nodeStart }
    }

    offset = nodeEnd
    node = walker.nextNode() as Text | null
  }

  return null
}

/** 将 scrollTop clamp 到 [0, scrollHeight-clientHeight]。 */
export function clampScrollTop(rootEl: HTMLElement, scrollTop: number): number {
  const max = Math.max(0, rootEl.scrollHeight - rootEl.clientHeight)
  return Math.max(0, Math.min(scrollTop, max))
}

/** 滚动 rootEl 使 rect 出现在视口顶部（减 SCROLL_TOP_OFFSET=40）。 */
export function scrollRootToRect(rootEl: HTMLElement, rect: DOMRect | null, offset: number = SCROLL_TOP_OFFSET): boolean {
  if (!rootEl || !rect) {
    return false
  }
  const rootRect = rootEl.getBoundingClientRect()
  const nextScrollTop = rootEl.scrollTop + rect.top - rootRect.top - offset
  rootEl.scrollTop = clampScrollTop(rootEl, nextScrollTop)
  return true
}

/** 滚动使 targetNode 的 targetOffset 字符进入视口。 */
export function scrollRangeIntoView(targetNode: Node, targetOffset: number, rootEl: HTMLElement): boolean {
  const range = document.createRange()
  range.setStart(targetNode, targetOffset)
  range.setEnd(targetNode, Math.min((targetNode as Text).textContent.length, targetOffset + 1))
  return scrollRootToRect(rootEl, range.getBoundingClientRect())
}

/** 按 summary 在 bodyEl 中匹配后滚动定位。 */
export function scrollToSummaryMatch(bodyEl: Element, rootEl: HTMLElement, summary: string): boolean {
  if (!bodyEl || !rootEl || !summary) {
    return false
  }
  const match = findNormalizedMatch(bodyEl.textContent || '', summary)
  if (!match) {
    return false
  }
  const textHit = findTextNodeAtOffset(bodyEl, match.start)
  if (!textHit) {
    return false
  }
  return scrollRangeIntoView(textHit.node, textHit.offset, rootEl)
}

/** 按 precent(0-1) 滚动 rootEl 到对应比例。 */
export function applyPrecentScroll(rootEl: HTMLElement, precent: number): boolean {
  const maxScroll = Math.max(0, rootEl.scrollHeight - rootEl.clientHeight)
  if (maxScroll <= 0) {
    return false
  }
  rootEl.scrollTop = Math.round(Math.min(1, Math.max(0, Number(precent))) * maxScroll)
  return true
}

/** 按 domPos 的段落索引滚动到对应 <p>。getParagraphIndexFromDomPos 由调用方注入避免循环依赖。 */
export function applyDomPosScroll(
  bodyEl: Element,
  domPos: string,
  rootEl: HTMLElement,
  getParagraphIndexFromDomPos: (domPos: string) => number
): boolean {
  if (!rootEl) {
    return false
  }
  const paragraphIndex = getParagraphIndexFromDomPos(domPos)
  const paragraphs = getParagraphElements(bodyEl)
  if (paragraphIndex < 0 || !paragraphs[paragraphIndex]) {
    return false
  }
  return scrollRootToRect(rootEl, paragraphs[paragraphIndex].getBoundingClientRect())
}

/** 拆分 domPos "0=1=0=0#N" 为 { domPosBase, curTextIdx }。 */
export function splitDomPos(domPos: string | null | undefined): { domPosBase: string; curTextIdx: number } {
  const [base = '0=1=0=0', charIdx = '0'] = String(domPos || '').split('#')
  return { domPosBase: base, curTextIdx: Number(charIdx) || 0 }
}

export interface DomPosNodeHit {
  node: Node
  textIdx: number
}

/** 按 domPos 路径逐级 childNodes 索引解析到目标节点 + curTextIdx。 */
export function traverseDomPosNode(bodyEl: Element, domPos: string): DomPosNodeHit | null {
  if (!bodyEl || !domPos) {
    return null
  }
  const { domPosBase, curTextIdx } = splitDomPos(domPos)
  const domArr = domPosBase.split('=').map(part => Number(part))
  let node: Node | null = bodyEl
  try {
    while (domArr.length) {
      const index = domArr.shift() as number
      node = node.childNodes[index]
    }
  } catch {
    return null
  }
  if (!node) {
    return null
  }
  return { node, textIdx: curTextIdx }
}

/** 由 contentLeft（相对 body）+ 页宽算横划页码：contentLeft≤0→0，否则 ceil(contentLeft/stride)-1。对齐 Vue reading-position.js:416 */
export function resolveHorizontalPageIndexFromContentLeft(
  contentLeft: number,
  pageWidth: number,
  pageGap: number = PAGE_COLUMN_GAP
): number | null {
  if (!Number.isFinite(contentLeft) || pageWidth <= 0) {
    return null
  }
  if (contentLeft <= 0) {
    return 0
  }
  const stride = getPageStride(pageWidth, pageGap)
  return Math.max(0, Math.ceil(contentLeft / stride) - 1)
}

/** 由 rect 相对 body 的 left 算横划页码。 */
export function resolveHorizontalPageFromRect(
  rect: DOMRect | null,
  bodyEl: Element,
  pageWidth: number
): number | null {
  if (!rect || !bodyEl || pageWidth <= 0) {
    return null
  }
  const contentLeft = rect.left - bodyEl.getBoundingClientRect().left
  return resolveHorizontalPageIndexFromContentLeft(contentLeft, pageWidth)
}

/** 取文本节点第 textIdx 字符的客户端矩形（跳过 0 宽度行）。 */
export function getTextNodeClientRect(node: Node, textIdx: number): DOMRect | null {
  const textLength = (node as Text).textContent?.length || 0
  const safeIdx = Math.min(Math.max(0, textIdx), textLength)
  const range = document.createRange()
  range.setStart(node, safeIdx)
  range.setEnd(node, Math.min(safeIdx + 1, textLength))

  const rects = range.getClientRects()
  let rect: DOMRect | null = rects[0] || null
  let index = 1
  while (rect && rect.width <= 0 && index < rects.length) {
    rect = rects[index]
    index += 1
  }
  return rect
}

export interface TextHitAtStrIdx {
  node: Text
  charIndex: number
  paragraphIndex: number
}

/** 按 strIdx（全章节字符序号）在 bodyEl 文本树中找到 { node, charIndex, paragraphIndex }。对齐 Vue reading-position.js:456 */
export function findTextHitAtStrIdx(bodyEl: Element, strIdx: number): TextHitAtStrIdx | null {
  if (!bodyEl || !Number.isFinite(strIdx) || strIdx < 0) {
    return null
  }
  let currentIdx = 0
  const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return (node as Text).textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })

  let node = walker.nextNode() as Text | null
  while (node) {
    const text = node.textContent || ''
    for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
      if (currentIdx === strIdx) {
        return { node, charIndex, paragraphIndex: findParagraphIndex(bodyEl, node) }
      }
      currentIdx += 1
    }
    node = walker.nextNode() as Text | null
  }
  return null
}

/** 由 strIdx 解析 domPos "0=1={paragraphIndex}=0#{charIndex}"。对齐 Vue reading-position.js:487 */
export function resolveDomPosFromStrIdx(bodyEl: Element, strIdx: number): string | null {
  const hit = findTextHitAtStrIdx(bodyEl, strIdx)
  if (!hit) {
    return null
  }
  return `0=1=${hit.paragraphIndex}=0#${hit.charIndex}`
}

/** 由 strIdx 算横划页码（定位字符矩形→contentLeft→页码）。对齐 Vue reading-position.js:495 */
export function resolveHorizontalPageFromStrIdx(
  bodyEl: Element,
  strIdx: number,
  pageWidth: number
): number | null {
  const hit = findTextHitAtStrIdx(bodyEl, strIdx)
  if (!hit || !bodyEl || pageWidth <= 0) {
    return null
  }
  if (hit.node.nodeType === Node.TEXT_NODE) {
    const rect = getTextNodeClientRect(hit.node, hit.charIndex)
    if (rect) {
      return resolveHorizontalPageFromRect(rect, bodyEl, pageWidth)
    }
  }
  return null
}

/** 由 domPos 算横划页码（解析节点→矩形→contentLeft→页码）。对齐 Vue reading-position.js:511 */
export function resolveHorizontalPageFromDomPos(
  bodyEl: Element,
  domPos: string,
  pageWidth: number
): number | null {
  const hit = traverseDomPosNode(bodyEl, domPos)
  if (!hit || !bodyEl || pageWidth <= 0) {
    return null
  }
  const { node, textIdx } = hit
  if (node.nodeType === Node.ELEMENT_NODE) {
    return resolveHorizontalPageFromRect((node as Element).getBoundingClientRect(), bodyEl, pageWidth)
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const rect = getTextNodeClientRect(node, textIdx)
    if (rect) {
      return resolveHorizontalPageFromRect(rect, bodyEl, pageWidth)
    }
  }
  return null
}

/** 按 summary 文本在 bodyEl 匹配后算横划页码。对齐 Vue reading-position.js:720 */
export function resolveHorizontalPageFromSummary(
  bodyEl: Element,
  summary: string,
  pageWidth: number
): number | null {
  if (!bodyEl || !summary || pageWidth <= 0) {
    return null
  }
  const match = findNormalizedMatch(bodyEl.textContent || '', summary)
  if (!match) {
    return null
  }
  const hit = findTextNodeAtOffset(bodyEl, match.start)
  if (!hit) {
    return null
  }
  const rect = getTextNodeClientRect(hit.node, hit.offset)
  if (!rect) {
    return null
  }
  return resolveHorizontalPageFromRect(rect, bodyEl, pageWidth)
}
