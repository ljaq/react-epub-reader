/**
 * 划线高亮 — 常量、样式、mark 元素包裹与 posInfo 解析。
 *
 * 源码对照：old-vue-reader/utils/line-highlight.js:1-434
 *
 * 关键常量（与 Vue 逐字对照）：
 * - DEFAULT_UNDERLINE_COLOR = 'rgba(255,157,0,0.3)'（line-highlight.js:4）
 * - LINE_COLOR_BLUE = '#0080FF'（line-highlight.js:5）
 * - 划线色值规则：underlineColor.length > 7 黄底，≤7 蓝线（line-highlight.js:10-11）
 */

import { encodeDomPath } from '../selection/dom-path'

export const DEFAULT_UNDERLINE_COLOR = 'rgba(255,157,0,0.3)'
export const LINE_COLOR_BLUE = '#0080FF'
export const LINE_COLOR_MAP = [DEFAULT_UNDERLINE_COLOR, LINE_COLOR_BLUE]
const BLOCK_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']

/** 对齐 openwap：色值长度 > 7 为黄色背景，否则为蓝色下划线 */
/** 划线色值规则：色值长度 > 7 视为黄底（rgba），否则蓝色下划线（#hex）。对齐 openwap line-highlight.js:10-11 */
export function isBackgroundLineColor(color: string | null | undefined): boolean {
  return (color || DEFAULT_UNDERLINE_COLOR).length > 7
}

/** 按 isBackgroundLineColor 给 mark 元素套用黄底或蓝线样式。对齐 Vue line-highlight.js:14 */
export function applyLineMarkStyle(mark: HTMLElement, underlineColor: string | null | undefined): void {
  if (!mark) {
    return
  }

  const color = underlineColor || DEFAULT_UNDERLINE_COLOR

  if (isBackgroundLineColor(color)) {
    mark.classList.remove('reader-line-mark--underline')
    mark.classList.add('reader-line-mark--background')
    mark.style.backgroundColor = color
    mark.style.borderBottom = ''
  } else {
    mark.classList.remove('reader-line-mark--background')
    mark.classList.add('reader-line-mark--underline')
    mark.style.backgroundColor = 'transparent'
    mark.style.borderBottom = `2px solid ${color}`
  }
}

function isTitleBlock(element: Element | null): boolean {
  return Boolean(
    element?.classList &&
      (element.classList.contains('tpl-162-title-1') || element.classList.contains('tpl-162-title-1-c'))
  )
}

function isSelectableBlock(element: Node | null): boolean {
  if (!element || (element as Element).nodeType !== Node.ELEMENT_NODE) {
    return false
  }
  return BLOCK_TAGS.includes((element as Element).tagName) || isTitleBlock(element as Element)
}

/** 由 node 向上找最近的 reader-line-mark 祖先 mark 元素。 */
export function findSelectableBlockAncestor(rootEl: Element, node: Node): Element | null {
  let current: Node | null = node
  while (current && current !== rootEl) {
    if (isSelectableBlock(current)) {
      return current as Element
    }
    current = current.parentNode
  }
  return null
}

function createMarkElement(webLineId: string, underlineColor: string): HTMLElement {
  const mark = document.createElement('mark')
  mark.className = 'reader-line-mark'
  mark.setAttribute('data-web-line-id', webLineId)
  applyLineMarkStyle(mark, underlineColor)
  return mark
}

function wrapTextNodeSlice(
  textNode: Text,
  start: number,
  end: number,
  webLineId: string,
  underlineColor: string
): HTMLElement | null {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE || start >= end) {
    return null
  }

  const text = textNode.textContent || ''
  const safeStart = Math.max(0, Math.min(start, text.length))
  const safeEnd = Math.max(safeStart, Math.min(end, text.length))
  if (safeStart >= safeEnd) {
    return null
  }

  const before = text.slice(0, safeStart)
  const selected = text.slice(safeStart, safeEnd)
  const after = text.slice(safeEnd)
  const parent = textNode.parentNode
  if (!parent) {
    return null
  }

  const mark = createMarkElement(webLineId, underlineColor)
  mark.textContent = selected

  const fragment = document.createDocumentFragment()
  if (before) {
    fragment.appendChild(document.createTextNode(before))
  }
  fragment.appendChild(mark)
  if (after) {
    fragment.appendChild(document.createTextNode(after))
  }

  parent.replaceChild(fragment, textNode)
  return mark
}

// eslint-disable-next-line complexity
function collectTextSlicesInRange(range: Range): { node: Text; start: number; end: number }[] {
  if (!range || range.collapsed) {
    return []
  }

  const slices: { node: Text; start: number; end: number }[] = []
  const root = range.commonAncestorContainer
  const walkerRoot = root.nodeType === Node.TEXT_NODE ? root.parentNode : root
  if (!walkerRoot) {
    return slices
  }

  const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null

  while (node) {
    if (!range.intersectsNode(node)) {
      node = walker.nextNode() as Text | null
      continue
    }

    const textLength = node.textContent?.length || 0
    const start = node === range.startContainer ? range.startOffset : 0
    const end = node === range.endContainer ? range.endOffset : textLength

    if (start < end) {
      slices.push({ node, start, end })
    }

    node = walker.nextNode() as Text | null
  }

  return slices
}

/** 用 Range 包裹选中文本节点切片为 mark 元素（倒序包裹避免偏移错乱），返回首个 mark。 */
export function wrapRangeByTextNodes(range: Range, webLineId: string, underlineColor: string): HTMLElement | null {
  const slices = collectTextSlicesInRange(range)
  if (!slices.length) {
    return null
  }

  const marks: HTMLElement[] = []
  for (let index = slices.length - 1; index >= 0; index -= 1) {
    const { node, start, end } = slices[index]
    const mark = wrapTextNodeSlice(node, start, end, webLineId, underlineColor)
    if (mark) {
      marks.push(mark)
    }
  }

  return marks[0] || null
}

/** 拆解 mark 元素：把子节点提回父节点后移除 mark。 */
export function unwrapMarkElement(mark: HTMLElement): void {
  if (!mark?.parentNode) {
    return
  }

  const parent = mark.parentNode
  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark)
  }
  parent.removeChild(mark)
}

/** 按 webLineId 拆解 rootEl 内所有该划线 mark。对齐 Vue line-highlight.js:625 */
export function unwrapLineMark(rootEl: Element, webLineId: string): void {
  if (!rootEl || !webLineId) {
    return
  }

  rootEl.querySelectorAll(`[data-web-line-id="${webLineId}"]`).forEach(mark => {
    unwrapMarkElement(mark as HTMLElement)
  })
}

/** 更新指定划线的色值样式（黄底↔蓝线切换）。对齐 Vue line-highlight.js:635 */
export function updateLineMarkStyle(rootEl: Element, webLineId: string, underlineColor: string): void {
  if (!rootEl || !webLineId) {
    return
  }

  rootEl.querySelectorAll(`[data-web-line-id="${webLineId}"]`).forEach(mark => {
    applyLineMarkStyle(mark as HTMLElement, underlineColor)
  })
}

/** 乐观 UI reconcile：把 oldId 的 mark 改名为 newId（服务端回写后）。对齐 Vue line-highlight.js:645 */
export function renameLineMarkId(rootEl: Element, oldId: string, newId: string): void {
  if (!rootEl || !oldId || !newId || oldId === newId) {
    return
  }

  rootEl.querySelectorAll(`[data-web-line-id="${oldId}"]`).forEach(mark => {
    mark.setAttribute('data-web-line-id', newId)
  })
}

export interface PosInfoEntry {
  p: string
  i: number
  v: number
  key: string
}

/** 解析 posInfo 为 { p, i, v, key } 条目列表（p=path, i=charIndex, v=charCode）。 */
export function parsePosInfoEntries(posInfo: Record<string, number> | null | undefined): PosInfoEntry[] {
  return Object.keys(posInfo || {})
    .map(key => {
      const hashIndex = key.lastIndexOf('#')
      if (hashIndex <= 0) {
        return null
      }
      const path = key.slice(0, hashIndex)
      const charIndex = parseInt(key.slice(hashIndex + 1), 10)
      if (Number.isNaN(charIndex)) {
        return null
      }
      return { p: path, i: charIndex, v: (posInfo as Record<string, number>)[key], key }
    })
    .filter((entry): entry is PosInfoEntry => Boolean(entry))
}

/** posInfo 条目排序：先按 path 各段数值升序，再按 charIndex 升序。 */
export function comparePosInfoEntries(a: PosInfoEntry, b: PosInfoEntry): number {
  const aParts = a.p.split('=').map(part => parseInt(part, 10))
  const bParts = b.p.split('=').map(part => parseInt(part, 10))
  const maxLength = Math.max(aParts.length, bParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const aValue = aParts[index] ?? -1
    const bValue = bParts[index] ?? -1
    if (aValue !== bValue) {
      return aValue - bValue
    }
  }

  return a.i - b.i
}

/** 按 "a=b=c" path 从 rootEl 逐级 childNodes 索引解析到目标节点。 */
export function resolveNodeFromPath(rootEl: Element, path: string): Node | null {
  if (!rootEl || !path) {
    return null
  }

  let node: Node | null = rootEl
  const parts = path.split('=')

  for (let index = 0; index < parts.length; index += 1) {
    const childIndex = parseInt(parts[index], 10)
    if (Number.isNaN(childIndex) || !node.childNodes[childIndex]) {
      return null
    }
    node = node.childNodes[childIndex]
  }

  return node
}

/** 把 posInfo 条目按所属可选中块分组（同块内排序），用于跨块划线逐块包裹。 */
export function groupEntriesByBlock(rootEl: Element, entries: PosInfoEntry[]): PosInfoEntry[][] {
  const groups = new Map<string, PosInfoEntry[]>()

  entries.forEach(entry => {
    const textNode = resolveNodeFromPath(rootEl, entry.p)
    const block = textNode ? findSelectableBlockAncestor(rootEl, textNode) : null
    const key = block ? encodeDomPath(block, rootEl) : entry.p

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(entry)
  })

  return Array.from(groups.values()).map(group => group.sort(comparePosInfoEntries))
}

/** 由一组 posInfo 条目构造 Range（起止节点均为文本节点，且同属一个可选中块）。 */
// eslint-disable-next-line complexity
export function buildRangeFromPosInfoEntries(rootEl: Element, entries: PosInfoEntry[]): Range | null {
  if (!entries?.length) {
    return null
  }

  const sorted = [...entries].sort(comparePosInfoEntries)
  const startNode = resolveNodeFromPath(rootEl, sorted[0].p)
  const endNode = resolveNodeFromPath(rootEl, sorted[sorted.length - 1].p)

  if (!startNode || startNode.nodeType !== Node.TEXT_NODE) {
    return null
  }
  if (!endNode || endNode.nodeType !== Node.TEXT_NODE) {
    return null
  }

  const startTextLength = (startNode as Text).textContent?.length || 0
  const endTextLength = (endNode as Text).textContent?.length || 0
  const startOffset = Math.min(sorted[0].i, startTextLength)
  const endOffset = Math.min(sorted[sorted.length - 1].i + 1, endTextLength)

  const range = document.createRange()
  range.setStart(startNode as Text, startOffset)
  range.setEnd(endNode as Text, endOffset)

  if (range.collapsed) {
    return null
  }

  const startBlock = findSelectableBlockAncestor(rootEl, startNode)
  const endBlock = findSelectableBlockAncestor(rootEl, endNode)
  if (!startBlock || !endBlock || startBlock !== endBlock) {
    return null
  }

  return range
}

/** 由 posInfo 构造划线目标 Range（按块分组，取首个可建块的组）。对齐 Vue line-highlight.js:419 */
export function buildTargetRangeFromPosInfo(rootEl: Element, posInfo: Record<string, number>): Range | null {
  const entries = parsePosInfoEntries(posInfo)
  if (!entries.length) {
    return null
  }

  const blockGroups = groupEntriesByBlock(rootEl, entries)
  for (let index = 0; index < blockGroups.length; index += 1) {
    const range = buildRangeFromPosInfoEntries(rootEl, blockGroups[index])
    if (range) {
      return range
    }
  }

  return null
}

/** 取 posInfo 的起止键（startKey/endKey），用于去重检测。对齐 Vue line-highlight.js:436 */
export function getPosInfoBoundaryKeys(
  posInfo: Record<string, number>
): { startKey: string; endKey: string } | null {
  const entries = parsePosInfoEntries(posInfo)
  if (!entries.length) {
    return null
  }

  const sorted = [...entries].sort(comparePosInfoEntries)
  const start = sorted[0]
  const end = sorted[sorted.length - 1]

  return {
    startKey: start.key || `${start.p}#${start.i}`,
    endKey: end.key || `${end.p}#${end.i}`
  }
}
