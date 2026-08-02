/**
 * 划线高亮 — 文本查找、章节同步、去重检测、联合矩形。
 *
 * 源码对照：old-vue-reader/utils/line-highlight.js:436-684
 */

import { extractDomPosBase, getParagraphIndexFromDomPos } from '../reading-position/pos-info'
import {
  buildRangeFromPosInfoEntries,
  buildTargetRangeFromPosInfo,
  comparePosInfoEntries,
  getPosInfoBoundaryKeys,
  groupEntriesByBlock,
  parsePosInfoEntries,
  resolveNodeFromPath,
  unwrapMarkElement,
  wrapRangeByTextNodes
} from './line-mark'

function normalizeText(text: string): string {
  return (text || '').replace(/\s+/gu, '')
}

function getParagraphElements(rootEl: Element | null): Element[] {
  if (!rootEl) {
    return []
  }
  return Array.from(rootEl.querySelectorAll('p'))
}

interface TextNodeOptions {
  skipLineMarks: boolean
  skipNoteMarks: boolean
}

const DEFAULT_TEXT_NODE_OPTIONS: TextNodeOptions = { skipLineMarks: true, skipNoteMarks: true }

function normalizeTextNodeOptions(options: TextNodeOptions | boolean | undefined): TextNodeOptions {
  if (options === true) {
    return { skipLineMarks: true, skipNoteMarks: true }
  }
  if (options === false) {
    return { skipLineMarks: false, skipNoteMarks: false }
  }
  return { ...DEFAULT_TEXT_NODE_OPTIONS, ...(options || {}) }
}

function isInsideMarkType(node: Node, className: string): boolean {
  let current: Node | null = node
  while (current && current !== document.body) {
    if ((current as Element).nodeType === Node.ELEMENT_NODE && (current as Element).classList?.contains(className)) {
      return true
    }
    current = current.parentNode
  }
  return false
}

function collectTextNodes(element: Element, options: TextNodeOptions = DEFAULT_TEXT_NODE_OPTIONS): Text[] {
  const { skipLineMarks, skipNoteMarks } = options
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node as Text).textContent) {
        return NodeFilter.FILTER_REJECT
      }
      if (skipLineMarks && isInsideMarkType(node, 'reader-line-mark')) {
        return NodeFilter.FILTER_REJECT
      }
      if (skipNoteMarks && isInsideMarkType(node, 'reader-note-mark')) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })

  const nodes: Text[] = []
  let current = walker.nextNode() as Text | null
  while (current) {
    nodes.push(current)
    current = walker.nextNode() as Text | null
  }
  return nodes
}

interface NormalizedMatch {
  start: number
  end: number
}

function findNormalizedMatch(fullText: string, normalizedSummary: string): NormalizedMatch | null {
  for (let start = 0; start < fullText.length; start += 1) {
    let cursor = 0
    let end = start
    while (end < fullText.length && cursor < normalizedSummary.length) {
      if (/\s/u.test(fullText[end])) {
        end += 1
        continue
      }
      if (fullText[end] !== normalizedSummary[cursor]) {
        break
      }
      cursor += 1
      end += 1
    }
    if (cursor === normalizedSummary.length) {
      return { start, end }
    }
  }
  return null
}

interface NodeRange {
  startNode: Text
  startOffset: number
  endNode: Text
  endOffset: number
}

function buildRangeFromNodes(nodes: Text[], matchStart: number, matchEnd: number): NodeRange | null {
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  let offset = 0

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const nodeText = node.textContent || ''
    const nodeStart = offset
    const nodeEnd = offset + nodeText.length

    if (matchEnd <= nodeStart) {
      break
    }

    if (matchStart < nodeEnd && matchEnd > nodeStart) {
      if (!startNode) {
        startNode = node
        startOffset = Math.max(0, matchStart - nodeStart)
      }
      endNode = node
      endOffset = Math.min(nodeText.length, matchEnd - nodeStart)
    }

    offset = nodeEnd
  }

  if (!startNode || !endNode) {
    return null
  }

  return { startNode, startOffset, endNode, endOffset }
}

function findTextInElement(
  element: Element,
  summary: string,
  textNodeOptions: TextNodeOptions = DEFAULT_TEXT_NODE_OPTIONS
): NodeRange | null {
  if (!element || !summary) {
    return null
  }

  const nodes = collectTextNodes(element, textNodeOptions)
  if (!nodes.length) {
    return null
  }

  const fullText = nodes.map(node => node.textContent).join('')
  const normalizedSummary = normalizeText(summary)
  if (!normalizedSummary) {
    return null
  }

  const normalizedMatch = findNormalizedMatch(fullText, normalizedSummary)
  if (normalizedMatch) {
    return buildRangeFromNodes(nodes, normalizedMatch.start, normalizedMatch.end)
  }

  const plainIndex = fullText.indexOf(summary)
  if (plainIndex >= 0) {
    return buildRangeFromNodes(nodes, plainIndex, plainIndex + summary.length)
  }

  return null
}

export interface LineItemLike {
  webLineId?: string
  posInfo?: Record<string, number>
  summary?: string
  underlineColor?: string
}

function wrapLineMarkFromPosInfo(rootEl: Element, lineItem: LineItemLike): HTMLElement | null {
  const entries = parsePosInfoEntries(lineItem.posInfo)
  if (!entries.length) {
    return null
  }

  const blockGroups = groupEntriesByBlock(rootEl, entries)
  const marks: HTMLElement[] = []

  blockGroups.forEach(group => {
    const range = buildRangeFromPosInfoEntries(rootEl, group)
    if (!range) {
      return
    }

    const mark = wrapRangeByTextNodes(range, lineItem.webLineId || '', lineItem.underlineColor || '')
    if (mark) {
      marks.push(mark)
    }
  })

  return marks[0] || null
}

/** 按 summary 文本在 rootEl 内查找划线目标（先按 posInfo 段落定位，再全文兜底）。对齐 Vue line-highlight.js:533 */
export function findLineTarget(
  rootEl: Element,
  lineItem: LineItemLike,
  textNodeOptions: TextNodeOptions | boolean | undefined = DEFAULT_TEXT_NODE_OPTIONS
): NodeRange | null {
  if (!rootEl || !lineItem?.summary) {
    return null
  }

  const summary = lineItem.summary
  const options = normalizeTextNodeOptions(textNodeOptions)
  const domPosBase = extractDomPosBase(lineItem.posInfo)
  const paragraphIndex = getParagraphIndexFromDomPos(domPosBase)
  const paragraphs = getParagraphElements(rootEl)

  if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) {
    const target = findTextInElement(paragraphs[paragraphIndex], summary, options)
    if (target) {
      return target
    }
  }

  for (let i = 0; i < paragraphs.length; i += 1) {
    const target = findTextInElement(paragraphs[i], summary, options)
    if (target) {
      return target
    }
  }

  return findTextInElement(rootEl, summary, options)
}

function wrapRangeWithMark(range: Range, webLineId: string, underlineColor: string): HTMLElement | null {
  if (!range || range.collapsed) {
    return null
  }
  return wrapRangeByTextNodes(range, webLineId, underlineColor)
}

/**
 * 包裹划线 mark：已存在则复用；优先按 posInfo 跨块包裹；否则按 summary 文本定位后包裹。
 * 返回首个 mark。对齐 Vue line-highlight.js:569。
 */
export function wrapLineMark(rootEl: Element, lineItem: LineItemLike): HTMLElement | null {
  if (!rootEl || !lineItem?.webLineId) {
    return null
  }

  const existing = rootEl.querySelector(`[data-web-line-id="${lineItem.webLineId}"]`)
  if (existing) {
    return existing as HTMLElement
  }

  if (lineItem.posInfo && Object.keys(lineItem.posInfo).length) {
    const posInfoMark = wrapLineMarkFromPosInfo(rootEl, lineItem)
    if (posInfoMark) {
      return posInfoMark
    }
  }

  const target = findLineTarget(rootEl, lineItem, { skipLineMarks: true, skipNoteMarks: false })
  if (!target) {
    return null
  }

  const range = document.createRange()
  range.setStart(target.startNode, target.startOffset)
  range.setEnd(target.endNode, target.endOffset)

  return wrapRangeWithMark(range, lineItem.webLineId, lineItem.underlineColor || '')
}

/** 批量应用章节内所有划线，返回成功包裹的 webLineId 列表。对齐 Vue line-highlight.js:598 */
export function applyChapterLines(
  rootEl: Element,
  chapterLinesData: { data?: Record<string, LineItemLike> } | null | undefined
): string[] {
  if (!rootEl || !chapterLinesData?.data) {
    return []
  }

  const applied: string[] = []
  Object.keys(chapterLinesData.data).forEach(webLineId => {
    const lineItem = chapterLinesData.data![webLineId]
    if (wrapLineMark(rootEl, { ...lineItem, webLineId })) {
      applied.push(webLineId)
    }
  })
  return applied
}

function findLineMarkFromNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null
  }
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  return element?.closest?.('.reader-line-mark') as HTMLElement | null
}

function detectSelectionInsideLineMark(bodyEl: Element, posInfo: Record<string, number>): string | null {
  const entries = parsePosInfoEntries(posInfo)
  const sorted = [...entries].sort(comparePosInfoEntries)
  const startNode = resolveNodeFromPath(bodyEl, sorted[0].p)
  const endNode = resolveNodeFromPath(bodyEl, sorted[sorted.length - 1].p)

  if (!startNode || !endNode) {
    return null
  }

  const startMark = findLineMarkFromNode(startNode)
  const endMark = findLineMarkFromNode(endNode)

  if (!startMark || startMark !== endMark) {
    return null
  }

  return startMark.getAttribute('data-web-line-id') || null
}

export interface DetectDuplicateLineInput {
  posInfo?: Record<string, number>
  chapterLinesData?: { data?: Record<string, { posInfo?: Record<string, number> }> }
  bodyEl?: Element
}

/**
 * 检测选区是否与已有划线重复：先按 posInfo 起止键在 chapterLinesData 命中；
 * 未命中再检测选区是否落在 DOM 内已存在的 line mark 中。对齐 Vue line-highlight.js:486。
 */
export function detectDuplicateLine({ posInfo, chapterLinesData, bodyEl }: DetectDuplicateLineInput = {}): string | null {
  const boundaries = getPosInfoBoundaryKeys(posInfo || {})
  if (!boundaries) {
    return null
  }

  const { startKey, endKey } = boundaries
  const lines = chapterLinesData?.data || {}

  for (const webLineId of Object.keys(lines)) {
    const linePosInfo = lines[webLineId]?.posInfo || {}
    if (linePosInfo[startKey] && linePosInfo[endKey]) {
      return webLineId
    }
  }

  if (bodyEl) {
    return detectSelectionInsideLineMark(bodyEl, posInfo || {})
  }

  return null
}

/** 取指定划线所有 mark 的并集屏幕矩形（用于滚动定位/角标）。对齐 Vue line-highlight.js:655 */
export function getLineMarksUnionRect(
  rootEl: Element,
  webLineId: string
): { top: number; left: number; width: number; height: number } | null {
  if (!rootEl || !webLineId) {
    return null
  }

  const marks = rootEl.querySelectorAll(`[data-web-line-id="${webLineId}"]`)
  if (!marks.length) {
    return null
  }

  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity

  marks.forEach(mark => {
    const rect = (mark as HTMLElement).getBoundingClientRect()
    top = Math.min(top, rect.top)
    left = Math.min(left, rect.left)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  })

  return { top, left, width: right - left, height: bottom - top }
}

export { buildTargetRangeFromPosInfo, unwrapMarkElement }
