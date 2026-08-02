/**
 * TTS 滚动与视口可见性辅助（纯函数，DOM 注入）。
 *
 * 源码对照：old-vue-reader/utils/tts-scroll.js:1-397
 *
 * 说明：源码中 isTtsPlaybackInView / scrollToTtsSegment / updateTtsSegmentVisibility
 * 依赖 reader.state / reader.mutations（store 耦合），属 Phase 6 编排层。本模块仅移植
 * 纯逻辑部分（buildTextNodeInView / isTtsSegmentInView / getTtsReadDomPositionFromViewport /
 * getReadDomPositionFromSnapshot），DOM 通过参数注入。
 */

import { computeDomPosFromTextNode } from './text-process-core'
import { judgeTtsInView } from './position'

const HORIZONTAL_TRANSITION_MS = 300

export { HORIZONTAL_TRANSITION_MS }

function getParagraphElements(bodyEl: Element | null): Element[] {
  if (!bodyEl) {
    return []
  }
  return Array.from(bodyEl.querySelectorAll('p'))
}

function isRectIntersectingViewport(rect: DOMRect, viewportRect: DOMRect): boolean {
  return (
    rect.bottom > viewportRect.top &&
    rect.top < viewportRect.bottom &&
    rect.right > viewportRect.left &&
    rect.left < viewportRect.right
  )
}

function isElementInViewForTts(rect: DOMRect, viewportRect: DOMRect, horizontal: boolean): boolean {
  if (horizontal) {
    return rect.right > viewportRect.left && rect.left < viewportRect.right
  }
  return rect.bottom > viewportRect.top && rect.top < viewportRect.bottom
}

function isFirstCharInViewForTts(range: Range, viewportRect: DOMRect, horizontal: boolean): boolean {
  const domRectList = range.getClientRects()
  if (!domRectList.length) {
    return false
  }

  let rect = domRectList[0]
  for (let index = 1; index < domRectList.length && rect.width <= 0; index += 1) {
    rect = domRectList[index]
  }

  if (rect.width <= 0 && rect.height <= 0) {
    return false
  }

  if (horizontal) {
    return rect.left >= viewportRect.left && rect.left < viewportRect.right
  }

  return rect.top >= viewportRect.top && rect.top < viewportRect.bottom
}

function shouldSkipEmptyElement(element: Element): boolean {
  const text = (element as HTMLElement).innerText || ''
  if (!text.length || /^(?:\u3000)+$/u.test(text)) {
    return !(element as HTMLElement).querySelectorAll('img').length
  }
  return false
}

interface TraverseState {
  domPos: string
  curTextIdx: number
  strIdx: number
  summary: string
}

function traverseElementNode(
  node: Element,
  index: number,
  viewportRect: DOMRect,
  horizontal: boolean,
  state: TraverseState
): boolean {
  const rect = node.getBoundingClientRect()
  if (!isElementInViewForTts(rect, viewportRect, horizontal)) {
    state.strIdx += (node.innerHTML || '').length
    return false
  }

  if (node.nodeName.toLowerCase() === 'img') {
    state.domPos += `=${index}`
    state.summary = '图片'
    return true
  }

  if (shouldSkipEmptyElement(node)) {
    return false
  }

  state.domPos += `=${index}`
  return findFirstNodeInView(node.childNodes, viewportRect, horizontal, state)
}

function traverseTextNode(
  node: Text,
  index: number,
  viewportRect: DOMRect,
  horizontal: boolean,
  state: TraverseState
): boolean {
  const text = node.nodeValue || ''
  let curTextIdx = 0
  const range = document.createRange()

  for (let j = 0; j < text.length; j += 1) {
    range.setStart(node, curTextIdx)
    range.setEnd(node, curTextIdx + 1)

    if (isFirstCharInViewForTts(range, viewportRect, horizontal)) {
      state.domPos += `=${index}`
      state.summary = text
      state.curTextIdx = curTextIdx
      return true
    }

    curTextIdx += 1
  }

  state.strIdx += curTextIdx
  if (curTextIdx < text.length) {
    state.curTextIdx = curTextIdx
    return true
  }

  return false
}

function findFirstNodeInView(
  doms: NodeListOf<ChildNode> | ChildNode[],
  viewportRect: DOMRect,
  horizontal: boolean,
  state: TraverseState
): boolean {
  for (let i = 0; i < doms.length; i += 1) {
    const node = doms[i]

    if ((node as Element).nodeType === Node.ELEMENT_NODE) {
      if (traverseElementNode(node as Element, i, viewportRect, horizontal, state)) {
        return true
      }
      continue
    }

    if ((node as Text).nodeType === Node.TEXT_NODE) {
      if (traverseTextNode(node as Text, i, viewportRect, horizontal, state)) {
        return true
      }
      continue
    }

    state.strIdx += ((node as Text).nodeValue || '').length
  }

  return false
}

export interface TextNodeInViewItem {
  pos: string
  startTextId: number
  endTextId: number
}

/** 构建视口内文本节点可见区间列表（{ pos, startTextId, endTextId }），用于 TTS 可见性判定。对齐 Vue tts-scroll.js:72 */
export function buildTextNodeInView({
  bodyEl,
  viewportEl,
  horizontal
}: {
  bodyEl: Element | null
  viewportEl: Element | null
  horizontal: boolean
}): TextNodeInViewItem[] {
  if (!bodyEl || !viewportEl) {
    return []
  }

  const viewportRect = viewportEl.getBoundingClientRect()
  const result: TextNodeInViewItem[] = []
  const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return (node as Text).textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })

  let node = walker.nextNode() as Text | null
  while (node) {
    const domPos = (node.parentElement as HTMLElement)?.dataset?.domPos || computeDomPosFromTextNode(node)
    if (domPos) {
      const visibleCharIndexes = collectVisibleCharIndexes(node, viewportRect, horizontal)

      if (visibleCharIndexes.length > 0) {
        result.push({
          pos: domPos,
          startTextId: visibleCharIndexes[0],
          endTextId: visibleCharIndexes[visibleCharIndexes.length - 1]
        })
      }
    }

    node = walker.nextNode() as Text | null
  }

  if (!result.length && !horizontal) {
    const paragraphs = getParagraphElements(bodyEl)
    paragraphs.forEach((paragraph, index) => {
      const rect = paragraph.getBoundingClientRect()
      if (isRectIntersectingViewport(rect, viewportRect)) {
        result.push({
          pos: `0=1=${index}=0`,
          startTextId: 0,
          endTextId: Math.max(0, (paragraph.textContent || '').length - 1)
        })
      }
    })
  }

  return result
}

function collectVisibleCharIndexes(node: Text, viewportRect: DOMRect, horizontal: boolean): number[] {
  const text = node.textContent || ''
  const visibleCharIndexes: number[] = []
  let curTextIdx = 0
  const range = document.createRange()

  for (let j = 0; j < text.length; j += 1) {
    range.setStart(node, curTextIdx)
    range.setEnd(node, curTextIdx + 1)

    if (isFirstCharInViewForTts(range, viewportRect, horizontal)) {
      visibleCharIndexes.push(curTextIdx)
    }

    curTextIdx += 1
  }

  return visibleCharIndexes
}

export interface IsTtsSegmentInViewInput {
  chapterId: number
  state: { chapterId?: number | null; ttsTextNodeInView?: TextNodeInViewItem[] }
  domPos: string
  wordIndex: number
}

/** 判断 TTS 段是否在视口可见（章节相同 + domPos/wordIndex 命中 state.ttsTextNodeInView）。对齐 Vue tts-scroll.js:120 */
export function isTtsSegmentInView({ chapterId, state, domPos, wordIndex }: IsTtsSegmentInViewInput): boolean {
  const ttsChapterId = Number(chapterId)
  const currentChapterId = Number(state?.chapterId)

  if (!ttsChapterId || Number.isNaN(ttsChapterId)) {
    return false
  }
  if (currentChapterId !== ttsChapterId) {
    return false
  }
  if (!domPos || typeof wordIndex !== 'number') {
    return false
  }

  return judgeTtsInView({
    chapterId: ttsChapterId,
    readChapterId: currentChapterId,
    textNodeInView: state?.ttsTextNodeInView || [],
    ttsCurrentDomPos: domPos,
    ttsCurrentWordIndex: wordIndex
  })
}

export interface TtsReadDomPosition {
  domPos: string
  textIdx: number
}

/** 由视口首个可见字符算 TTS 起播 domPos/textIdx（兼容 filterTextByDomPos）。对齐 Vue tts-scroll.js:378 */
export function getTtsReadDomPositionFromViewport({
  bodyEl,
  viewportEl,
  horizontal
}: {
  bodyEl: Element | null
  viewportEl: Element | null
  horizontal: boolean
}): TtsReadDomPosition {
  if (!bodyEl || !viewportEl) {
    return { domPos: '', textIdx: 0 }
  }

  const viewportRect = viewportEl.getBoundingClientRect()
  const state: TraverseState = { domPos: '', curTextIdx: 0, strIdx: 0, summary: '' }

  findFirstNodeInView(bodyEl.childNodes, viewportRect, Boolean(horizontal), state)

  return {
    domPos: state.domPos.replace(/^=/u, ''),
    textIdx: state.curTextIdx
  }
}

/** 由阅读快照取 TTS 起播位置（domPos 去 #N，textIdx 取 charIdx 或 strIdx）。对齐 Vue tts-scroll.js:256 */
export function getReadDomPositionFromSnapshot(snapshot: { domPos?: string; strIdx?: number } = {}): TtsReadDomPosition {
  const [base = '', charIdx = '0'] = String(snapshot.domPos || '').split('#')
  return {
    domPos: base,
    textIdx: Number(charIdx) || Number(snapshot.strIdx) || 0
  }
}
