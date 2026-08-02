/**
 * 选区文本定位核心：字符矩形、边界归一化、高亮项构造。
 *
 * 源码对照：old-vue-reader/utils/selection-text-pos.js:1-390
 */

import { SELECTION_MODE_HORIZONTAL, SELECTION_MODE_VERTICAL, type SelectionMode } from './dom-path'

const WORD_SEPARATOR_REG = /\s|'|’|-|\/|:|\[|\]|#|\(|\)/iu

function floorRect(rect: { top: number; bottom: number; left: number; right: number; width: number; height: number }) {
  return {
    top: Math.floor(rect.top),
    bottom: Math.floor(rect.bottom),
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height
  }
}

function shouldSkipElement(node: Node | null): boolean {
  if (!node || (node as Element).nodeType !== Node.ELEMENT_NODE) {
    return false
  }

  const tag = (node as Element).nodeName.toLowerCase()
  if (/^(?:rt|sup)$/iu.test(tag)) {
    return true
  }

  if (tag === 'a' && window.getComputedStyle(node as Element, null).verticalAlign === 'super') {
    return true
  }

  return false
}

export interface CharRect {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

/** 取单个字符的屏幕矩形（range 选一字 + pageY 偏移，竖滚用）。宽度<1 视为不可见返回 null。对齐 Vue selection-text-pos.js:33 */
export function getCharRect(node: Node, charIndex: number, pageY: number = 0): CharRect | null {
  const range = document.createRange()
  range.setStart(node, charIndex)
  range.setEnd(node, charIndex + 1)

  const rectList = Array.from(range.getClientRects())
  if (!rectList.length) {
    return null
  }

  let txtRect = rectList[0]
  if (rectList.length > 1) {
    const valid = rectList.find(item => item.width >= 1)
    if (valid) {
      txtRect = valid
    }
  }

  if (txtRect.width < 1) {
    return null
  }

  return floorRect({
    top: txtRect.top + pageY,
    bottom: txtRect.bottom + pageY,
    left: txtRect.left,
    right: txtRect.right,
    width: txtRect.width,
    height: txtRect.height
  })
}

export interface Boundary {
  x: number
  y: number
}

export interface NormalizeBoundariesResult {
  boundary1: Boundary
  boundary2: Boundary
  needUp: boolean
}

/**
 * 归一化两个边界点：根据当前拖拽的边界(curBoundary)与行高/字号，
 * 对齐同行 y、必要时交换 x/y 使 boundary1 始终在前、boundary2 在后，并判定 needUp（反向选择）。
 * 对齐 Vue selection-text-pos.js:66。
 */
// eslint-disable-next-line complexity
export function normalizeBoundaries(
  boundary1: Boundary,
  boundary2: Boundary,
  curBoundary: number,
  lineHeight: number,
  fontSize: number
): NormalizeBoundariesResult {
  const b1 = { ...boundary1 }
  const b2 = { ...boundary2 }
  let needUp = false
  const lh = lineHeight || 20
  const rfs = fontSize || 16

  if (curBoundary === 1) {
    if (b1.y + lh - rfs < b2.y) {
      needUp = false
    } else if (b1.y < b2.y + lh) {
      const alignedY = Math.max(b1.y, b2.y)
      b1.y = alignedY
      b2.y = alignedY
      if (b1.x > b2.x) {
        needUp = true
        const swapX = b1.x
        b1.x = b2.x
        b2.x = swapX
      } else {
        needUp = false
      }
    } else {
      needUp = true
      const swapX = b1.x
      const swapY = b1.y
      b1.x = b2.x
      b1.y = b2.y
      b2.x = swapX
      b2.y = swapY
    }
  } else if (curBoundary === 2) {
    if (b2.y > b1.y + lh) {
      needUp = false
    } else if (b2.y + lh - rfs > b1.y) {
      const alignedY = Math.min(b1.y, b2.y)
      b1.y = alignedY
      b2.y = alignedY
      if (b1.x > b2.x) {
        needUp = true
        const swapX = b1.x
        b1.x = b2.x
        b2.x = swapX
      } else {
        needUp = false
      }
    } else {
      needUp = true
      const swapX = b1.x
      const swapY = b1.y
      b1.x = b2.x
      b1.y = b2.y
      b2.x = swapX
      b2.y = swapY
    }
  }

  return { boundary1: b1, boundary2: b2, needUp }
}

interface JudgeInRectOptions {
  boundary1: Boundary
  boundary2: Boundary
  mode: SelectionMode
  scrollTop: number
  viewportWidth: number
  viewportHeight: number
  limitH: number
}

function createJudgeInRect({
  boundary1,
  boundary2,
  mode,
  scrollTop,
  viewportWidth,
  viewportHeight,
  limitH
}: JudgeInRectOptions) {
  const pageY = mode === SELECTION_MODE_VERTICAL ? scrollTop : 0

  // eslint-disable-next-line complexity
  return function judgeInRect(rect: CharRect): boolean {
    let isInView = false

    if (mode === SELECTION_MODE_HORIZONTAL) {
      isInView = rect.left >= 0 && rect.left <= viewportWidth
    } else {
      isInView = rect.top >= pageY && rect.bottom <= viewportHeight + pageY
    }

    if (!isInView) {
      return false
    }

    isInView = false

    if (boundary2.y - boundary1.y > limitH) {
      isInView =
        rect.top > boundary1.y &&
        rect.bottom < boundary2.y &&
        (rect.left + rect.width / 2 >= boundary1.x || rect.top - limitH >= boundary1.y) &&
        (rect.right - rect.width / 2 <= boundary2.x || rect.bottom + limitH <= boundary2.y)

      if (!isInView) {
        isInView =
          (rect.bottom >= boundary1.y && rect.top <= boundary1.y && rect.left + rect.width / 2 >= boundary1.x) ||
          (rect.bottom >= boundary2.y && rect.top <= boundary2.y && Math.floor(rect.right - rect.width / 2) <= boundary2.x)
      }
    }

    if (!isInView) {
      isInView =
        boundary2.y === boundary1.y &&
        rect.top <= boundary1.y &&
        rect.bottom >= boundary1.y &&
        rect.left + rect.width / 2 >= boundary1.x &&
        Math.floor(rect.right - rect.width / 2) <= boundary2.x
    }

    return isInView
  }
}

export interface HighlightPosItem {
  left: number
  top: number
  right: number
  bottom: number
  h: number
  v: number
  p: string
  i: number
}

function buildHighlightItem(
  rect: CharRect,
  chars: string,
  charIndex: number,
  pos: string,
  domIndex: number,
  lastRect: CharRect | null
): HighlightPosItem {
  const isIOS = /iPad|iPhone|iPod/u.test(navigator.userAgent)
  let itemRect: CharRect = { ...rect }

  if (isIOS && lastRect && Math.abs(itemRect.left - lastRect.right) < 3) {
    const width = itemRect.right - lastRect.right - 1
    itemRect = { ...itemRect, left: lastRect.right, width }
  }

  return {
    left: itemRect.left,
    top: itemRect.top,
    right: itemRect.right,
    bottom: itemRect.bottom,
    h: itemRect.height,
    v: chars.charCodeAt(charIndex),
    p: `${pos}=${domIndex}`,
    i: charIndex
  }
}

function traverseChildren(
  el: Node,
  pos: string,
  pageY: number,
  judgeInRect: (rect: CharRect) => boolean,
  result: HighlightPosItem[]
): void {
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const node = el.childNodes[i]

    if ((node as Text).nodeType === Node.TEXT_NODE) {
      const chars = (node as Text).textContent || ''
      let lastRect: CharRect | null = null
      let started = false

      for (let j = 0; j < chars.length; j += 1) {
        const rect = getCharRect(node, j, pageY)
        if (!rect) {
          continue
        }
        if (!judgeInRect(rect)) {
          if (started) {
            break
          }
          continue
        }
        started = true
        const item = buildHighlightItem(rect, chars, j, pos, i, lastRect)
        result.push(item)
        lastRect = rect
      }
    } else if ((node as Element).nodeType === Node.ELEMENT_NODE) {
      if (shouldSkipElement(node)) {
        continue
      }
      traverseChildren(node, `${pos}=${i}`, pageY, judgeInRect, result)
    }
  }
}

export interface GetTextsPosInput {
  dom: Element | null
  pos: string | null
  boundary1: Boundary | null
  boundary2: Boundary | null
  curBoundary?: number
  mode?: SelectionMode
  scrollTop?: number
}

/**
 * 遍历 dom 子树，收集落在 boundary1/boundary2 围成选区内的字符高亮项（含 charCode/path/index/rect）。
 * mode=vertical 时 y 用 pageY 偏移；horizontal 时按 x 在视口内判定。对齐 Vue selection-text-pos.js:239。
 */
export function getTextsPos({
  dom,
  pos,
  boundary1,
  boundary2,
  curBoundary = 0,
  mode = SELECTION_MODE_VERTICAL,
  scrollTop = 0
}: GetTextsPosInput): HighlightPosItem[] {
  if (!dom || !pos || !boundary1 || !boundary2) {
    return []
  }

  const computed = window.getComputedStyle(dom, null)
  const lineHeight = parseInt(computed.lineHeight, 10) || 20
  const fontSize = parseInt(computed.fontSize, 10) || 16
  const limitH = lineHeight - fontSize

  const normalized = normalizeBoundaries(boundary1, boundary2, curBoundary, lineHeight, fontSize)
  const judgeInRect = createJudgeInRect({
    boundary1: normalized.boundary1,
    boundary2: normalized.boundary2,
    mode,
    scrollTop,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    limitH
  })

  const pageY = mode === SELECTION_MODE_VERTICAL ? scrollTop : 0
  const result: HighlightPosItem[] = []
  traverseChildren(dom, pos, pageY, judgeInRect, result)

  return result
}

/** 判断文本是否以中文为主（中文占比 ≥ 0.3）。决定英文选区是否走 adjustHighlightDist 按词扩展。对齐 Vue selection-text-pos.js:275 */
export function isChineseDominant(text: string): boolean {
  if (!text) {
    return true
  }
  const chineseCount = (text.match(/[\u4e00-\u9fff]/gu) || []).length
  return chineseCount / text.length >= 0.3
}

/**
 * 英文选区按词扩展：以触点为中心向前后扩展到词边界（遇空格/标点停），
 * 避免英文选中半个词。仅 horizontal 模式且非中文主导时调用。对齐 Vue selection-text-pos.js:285。
 */
// eslint-disable-next-line complexity
export function adjustHighlightDist(
  highlightPosList: HighlightPosItem[],
  touchX: number,
  touchY: number,
  mode: SelectionMode = SELECTION_MODE_HORIZONTAL
): HighlightPosItem[] {
  if (!highlightPosList?.length) {
    return []
  }

  const limitX = touchX
  let limitY = touchY

  if (mode === SELECTION_MODE_HORIZONTAL) {
    if (highlightPosList[0].top > touchY) {
      limitY = highlightPosList[0].top
    } else if (highlightPosList[highlightPosList.length - 1].bottom < touchY) {
      limitY = highlightPosList[highlightPosList.length - 1].bottom
    }
  }

  let centerPoint = -1
  let subCenterPoint = -1
  const newList: HighlightPosItem[] = []

  for (let i = 0; i < highlightPosList.length; i += 1) {
    const item = highlightPosList[i]
    if (item.left <= limitX && item.right >= limitX && item.top <= limitY && item.bottom >= limitY) {
      centerPoint = i
      newList.push(item)
      break
    }
    if (item.left <= limitX && item.right >= limitX) {
      if (subCenterPoint === -1) {
        subCenterPoint = i
      } else if (Math.abs(item.top - limitY) < Math.abs(highlightPosList[subCenterPoint].top - limitY)) {
        subCenterPoint = i
      }
    }
  }

  if (centerPoint === -1) {
    if (subCenterPoint === -1) {
      return []
    }
    newList.push(highlightPosList[subCenterPoint])
    limitY = highlightPosList[subCenterPoint].top
  }

  const anchor = centerPoint === -1 ? subCenterPoint : centerPoint

  function lookBack(): void {
    for (let i = anchor; i >= 0; i -= 1) {
      const item = highlightPosList[i]
      if (!WORD_SEPARATOR_REG.test(String.fromCharCode(item.v)) && item.top <= limitY && item.bottom >= limitY) {
        newList.unshift(item)
      } else {
        break
      }
    }
  }

  function lookForward(): void {
    for (let i = anchor + 1; i < highlightPosList.length; i += 1) {
      const item = highlightPosList[i]
      if (!WORD_SEPARATOR_REG.test(String.fromCharCode(item.v)) && item.top <= limitY && item.bottom >= limitY) {
        newList.push(item)
      } else {
        break
      }
    }
  }

  if (WORD_SEPARATOR_REG.test(String.fromCharCode(newList[0].v))) {
    newList.pop()
    lookForward()
  } else if (newList[0].v === 46) {
    return newList
  } else {
    lookBack()
    lookForward()
  }

  return newList
}

/** 高亮项列表 → 纯文本（按 charCode 还原）。对齐 Vue selection-text-pos.js:369 */
export function highlightPosListToText(list: HighlightPosItem[] | null): string {
  if (!list?.length) {
    return ''
  }
  return list.map(item => String.fromCharCode(item.v)).join('')
}

export interface HighlightPosListToPosInfoResult {
  text: string
  posInfo: Record<string, number>
  domPosBase: string
}

/**
 * 高亮项列表 → { text, posInfo, domPosBase }。posInfo 键 "p#i" → charCode，
 * domPosBase 取首项 path 前 3 段。字节级兼容 Vue posInfo 格式。对齐 Vue selection-text-pos.js:376。
 */
export function highlightPosListToPosInfo(list: HighlightPosItem[] | null): HighlightPosListToPosInfoResult {
  const text = highlightPosListToText(list)
  if (!text) {
    return { text: '', posInfo: {}, domPosBase: '0=1=0=0' }
  }

  const posInfo: Record<string, number> = {}
  list!.forEach(item => {
    posInfo[`${item.p}#${item.i}`] = item.v
  })

  const domPosBase = list![0].p.split('=').slice(0, 3).join('=') || list![0].p

  return { text, posInfo, domPosBase }
}
