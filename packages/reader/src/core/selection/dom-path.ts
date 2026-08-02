/**
 * 选区 DOM 路径编码与可视块定位。
 *
 * 源码对照：old-vue-reader/utils/selection-dom-path.js:1-174
 *
 * 选中双模式：SELECTION_MODE_VERTICAL / SELECTION_MODE_HORIZONTAL
 * （selection-dom-path.js:6-7）
 */

import { getCaretRangeFromPoint } from './range'

const BLOCK_FALLBACK_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV']
const SELECTABLE_BLOCK_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']

export const SELECTION_MODE_VERTICAL = 'vertical'
export const SELECTION_MODE_HORIZONTAL = 'horizontal'

export type SelectionMode = typeof SELECTION_MODE_VERTICAL | typeof SELECTION_MODE_HORIZONTAL

function isTitleBlock(element: Element): boolean {
  return (
    element.classList &&
    (element.classList.contains('tpl-162-title-1') || element.classList.contains('tpl-162-title-1-c'))
  )
}

function isSelectableBlock(element: Node | null): boolean {
  if (!element || (element as Element).nodeType !== Node.ELEMENT_NODE) {
    return false
  }

  const el = element as Element
  if (SELECTABLE_BLOCK_TAGS.includes(el.tagName) || isTitleBlock(el)) {
    return Boolean(el.textContent?.trim())
  }

  return false
}

function findParagraphBlock(node: Node, rootEl: Element): Element | null {
  let current: Node | null = node
  while (current && current !== rootEl) {
    if ((current as Element).nodeType === Node.ELEMENT_NODE) {
      const el = current as Element
      if (el.tagName === 'P' || isTitleBlock(el)) {
        return el
      }
    }
    current = current.parentNode
  }
  return null
}

function findFallbackBlock(node: Node, rootEl: Element): Element | null {
  let current: Node | null = node
  while (current && current !== rootEl) {
    if ((current as Element).nodeType === Node.ELEMENT_NODE && BLOCK_FALLBACK_TAGS.includes((current as Element).tagName)) {
      const text = (current as Element).textContent?.trim()
      if (text) {
        return current as Element
      }
    }
    current = current.parentNode
  }
  return null
}

function findSelectableBlock(node: Node, rootEl: Element): Element | null {
  return findParagraphBlock(node, rootEl) || findFallbackBlock(node, rootEl)
}

/** 由坐标命中可选中段落块（P/H1-6/LI 或 tpl-162-title）。对齐 Vue selection-dom-path.js:59 */
export function findParagraphFromPoint(x: number, y: number, rootEl: Element | null): Element | null {
  const caretRange = getCaretRangeFromPoint(x, y)
  if (!caretRange || !rootEl?.contains(caretRange.startContainer)) {
    return null
  }

  return findSelectableBlock(caretRange.startContainer, rootEl)
}

/** 将 el 相对 rootEl 的 childNode 路径编码为 "a=b=c" 字符串（domPos 的 path 部分）。对齐 Vue selection-dom-path.js:68 */
export function encodeDomPath(el: Element | null, rootEl: Element | null): string {
  if (!el || !rootEl || !rootEl.contains(el)) {
    return '0'
  }

  const parts: number[] = []
  let current: Node | null = el

  while (current && current !== rootEl) {
    const parent: Node | null = current.parentNode
    if (!parent) {
      break
    }

    const index = Array.prototype.indexOf.call(parent.childNodes, current)
    if (index < 0) {
      break
    }

    parts.push(index)
    current = parent
  }

  return parts.reverse().join('=')
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function collectSelectableBlocks(rootEl: Element): Element[] {
  const blocks: Element[] = []

  function walk(node: Node | null): void {
    if (!node) {
      return
    }

    if ((node as Element).nodeType === Node.ELEMENT_NODE) {
      if (isSelectableBlock(node)) {
        blocks.push(node as Element)
        return
      }
      Array.from(node.childNodes).forEach(walk)
    }
  }

  walk(rootEl)
  return blocks
}

export interface DomInViewItem {
  dom: Element
  pos: string
  body: Element
}

/**
 * 收集当前视口内所有可选中段落块（带 dom 路径与所属 body）。
 * 竖滚模式用 scrollContainer rect 限定视口；横划用 window。对齐 Vue selection-dom-path.js:120。
 */
export function getDomsInView(
  bodies: Element[] | null,
  mode: SelectionMode,
  scrollContainer: Element | null
): DomInViewItem[] {
  if (!bodies?.length) {
    return []
  }

  const viewport = {
    top: 0,
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight
  }

  if (mode === SELECTION_MODE_VERTICAL && scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect()
    viewport.top = containerRect.top
    viewport.bottom = containerRect.bottom
    viewport.left = containerRect.left
    viewport.right = containerRect.right
  }

  const result: DomInViewItem[] = []

  bodies.forEach(body => {
    if (!body) {
      return
    }

    const blocks = collectSelectableBlocks(body)
    blocks.forEach(block => {
      const rect = block.getBoundingClientRect()
      if (!rect.width && !rect.height) {
        return
      }

      if (rectsIntersect(rect, viewport as DOMRect)) {
        result.push({
          dom: block,
          pos: encodeDomPath(block, body),
          body
        })
      }
    })
  })

  return result
}

/** 由坐标命中所属 body（章节正文容器）。对齐 Vue selection-dom-path.js:167 */
export function findBodyFromPoint(x: number, y: number, bodies: Element[] | null): Element | null {
  return (
    (bodies || []).find(body => {
      const rect = body.getBoundingClientRect()
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    }) || null
  )
}
