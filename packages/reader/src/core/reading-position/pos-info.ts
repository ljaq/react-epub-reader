/**
 * posInfo / domPos 锚点编解码。
 *
 * 源码对照：old-vue-reader/utils/pos-info.js:1-291
 *
 * 锚点格式（字节级沿用 Vue，不改）：
 * - posInfo = { "0=1=7=0#N": charCode, ... }
 * - domPos   = "0=1=7=0#N"
 * - domPosBase = "0=1=7=0"（domPos 去掉 #N）
 */

const DEFAULT_UNDERLINE_COLOR = 'rgba(255,157,0,0.3)'

/** 生成客户端临时划线 id：`er` + 时间戳 + 随机数。对齐 Vue pos-info.js:3 */
export function generateReaderWebId(): string {
  return `er${Date.now()}${Math.floor(Math.random() * 10000)}`
}

/** 书签 id = chapterId(4位补0) + strIdx(5位补0)。对齐 Vue pos-info.js:7 */
export function generateBookmarkId(chapterId: number, strIdx: number = 0): string {
  const chapterPart = String(chapterId).padStart(4, '0').slice(-4)
  const strPart = String(Math.max(0, Math.floor(strIdx)))
    .padStart(5, '0')
    .slice(-5)
  return `${chapterPart}${strPart}`
}

/** 从书签 id 末 5 位解析 strIdx；长度不足返回 null。对齐 Vue pos-info.js:15 */
export function parseStrIdxFromBookmarkId(bookmarkId: string | null | undefined): number | null {
  const id = String(bookmarkId || '')
  if (id.length < 5) {
    return null
  }
  const strIdx = parseInt(id.slice(-5), 10)
  return Number.isFinite(strIdx) ? strIdx : null
}

function buildHorizontalPositionFields(
  pageIndex: number,
  pageCount: number
): { cur: number; totalPage: number; isLastPage: boolean } {
  const count = Math.max(1, Number(pageCount) || 1)
  const pageIdx = Math.min(count - 1, Math.max(0, Number(pageIndex) || 0))
  return {
    cur: pageIdx,
    totalPage: count,
    isLastPage: pageIdx >= count - 1
  }
}

export interface BookmarkSummaryPayload {
  domPos?: string
  precent?: number
  summary?: string
  strIdx?: number
  horizontal?: boolean
  pageIndex?: number
  pageCount?: number
  h5PageY?: number
}

/** 书签 summary 编码为 JSON：含 domPos/precent/summary/strIdx，横划加 cur/totalPage/isLastPage，竖滚加 h5PageY。对齐 Vue pos-info.js:34 */
export function encodeBookmarkSummary(payload: BookmarkSummaryPayload = {}): string {
  const data: Record<string, unknown> = {
    domPos: payload.domPos || '0=1=0=0#0',
    precent: payload.precent ?? 0,
    summary: payload.summary || '',
    strIdx: payload.strIdx ?? 0
  }

  if (payload.horizontal) {
    Object.assign(data, buildHorizontalPositionFields(payload.pageIndex || 0, payload.pageCount || 1))
  } else if (Number.isFinite(payload.h5PageY)) {
    data.h5PageY = Math.max(0, Number(payload.h5PageY))
  }

  return JSON.stringify(data)
}

function pickFiniteNumber(value: unknown): number | null {
  return Number.isFinite(value) ? Number(value) : null
}

interface ParsedBookmarkSummary {
  domPos: string | undefined
  precent: number | null
  strIdx: number | null
  cur: number | null
  totalPage: number | null
  isLastPage: boolean | null
  h5PageY: number | null
  summary: string
}

function parseBookmarkJsonSummary(parsed: Record<string, unknown>): ParsedBookmarkSummary {
  return {
    domPos: parsed.domPos as string | undefined,
    precent: pickFiniteNumber(parsed.precent),
    strIdx: pickFiniteNumber(parsed.strIdx),
    cur: pickFiniteNumber(parsed.cur),
    totalPage: pickFiniteNumber(parsed.totalPage),
    isLastPage: typeof parsed.isLastPage === 'boolean' ? parsed.isLastPage : null,
    h5PageY: pickFiniteNumber(parsed.h5PageY),
    summary: (parsed.summary as string) || ''
  }
}

export interface DecodedBookmarkSummary {
  domPos?: string
  precent?: number | null
  strIdx?: number | null
  cur?: number | null
  totalPage?: number | null
  isLastPage?: boolean | null
  h5PageY?: number | null
  summary?: string
}

/** 解码书签 summary JSON；非 JSON 回退 { summary }。对齐 Vue pos-info.js:68 */
export function decodeBookmarkSummary(summaryStr: string | null | undefined): DecodedBookmarkSummary {
  if (!summaryStr) {
    return {}
  }

  if (typeof summaryStr !== 'string') {
    return { summary: String(summaryStr || '') }
  }

  const trimmed = summaryStr.trim()
  if (!trimmed.startsWith('{')) {
    return { summary: summaryStr }
  }

  try {
    const parsed = JSON.parse(summaryStr)
    if (!parsed || typeof parsed !== 'object') {
      return { summary: summaryStr }
    }
    return parseBookmarkJsonSummary(parsed as Record<string, unknown>)
  } catch {
    return { summary: summaryStr }
  }
}

/** 由文本 + domPosBase 生成 posInfo：键 `${domPosBase}#${i}` → charCode。对齐 Vue pos-info.js:93 */
export function buildPosInfoFromText(text: string, domPosBase: string = '0=1=7=0'): Record<string, number> {
  const posInfo: Record<string, number> = {}
  if (!text) {
    return posInfo
  }

  for (let i = 0; i < text.length; i += 1) {
    posInfo[`${domPosBase}#${i}`] = text.charCodeAt(i)
  }

  return posInfo
}

export interface EncodeSummaryPayload {
  [key: string]: unknown
  summary?: string
  domPosBase?: string
  domPos?: string
  posInfo?: Record<string, number>
  underlineColor?: string
}

/** 划线 summary 编码：无 posInfo 时按 summary 文本生成；无 domPos 时补默认黄底色。对齐 Vue pos-info.js:106 */
export function encodeSummary(payload: EncodeSummaryPayload = {}): string {
  const data: Record<string, unknown> = { ...payload }

  if (!('posInfo' in data) && data.summary) {
    data.posInfo = buildPosInfoFromText(String(data.summary), (data.domPosBase as string) || '0=1=7=0')
  }

  if (!('underlineColor' in data) && 'summary' in data && !data.domPos) {
    data.underlineColor = DEFAULT_UNDERLINE_COLOR
  }

  delete data.domPosBase

  return JSON.stringify(data)
}

/** 解码划线 summary JSON；失败返回 {}。对齐 Vue pos-info.js:122 */
export function decodeSummary(str: string | null | undefined): Record<string, unknown> {
  if (!str) {
    return {}
  }

  try {
    return JSON.parse(str) as Record<string, unknown>
  } catch {
    return {}
  }
}

interface DomPosEntry {
  path: string
  charIndex: number
}

function compareDomPosKeys(a: DomPosEntry, b: DomPosEntry): number {
  const aParts = a.path.split('=').map(part => parseInt(part, 10))
  const bParts = b.path.split('=').map(part => parseInt(part, 10))
  const maxLength = Math.max(aParts.length, bParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const aValue = aParts[index] ?? -1
    const bValue = bParts[index] ?? -1
    if (aValue !== bValue) {
      return aValue - bValue
    }
  }

  return a.charIndex - b.charIndex
}

/** 从 posInfo 取最小 domPos（按 path/charIndex 排序后取首项）。空时回退 '0=1=0=0#0'。对齐 Vue pos-info.js:150 */
export function extractDomPosFromPosInfo(posInfo: Record<string, number> | null | undefined): string {
  const entries = Object.keys(posInfo || {})
    .map(key => {
      const hashIndex = key.lastIndexOf('#')
      if (hashIndex <= 0) {
        return null
      }
      const charIndex = parseInt(key.slice(hashIndex + 1), 10)
      if (Number.isNaN(charIndex)) {
        return null
      }
      return {
        path: key.slice(0, hashIndex),
        charIndex
      }
    })
    .filter((entry): entry is DomPosEntry => Boolean(entry))
    .sort(compareDomPosKeys)

  if (!entries.length) {
    return '0=1=0=0#0'
  }

  const first = entries[0]
  return `${first.path}#${first.charIndex}`
}

/** 从 posInfo 取 domPosBase（domPos 去掉 #N）。空时回退 '0=1=7=0'。对齐 Vue pos-info.js:177 */
export function extractDomPosBase(posInfo: Record<string, number> | null | undefined): string {
  const domPos = extractDomPosFromPosInfo(posInfo)
  return domPos.split('#')[0] || '0=1=7=0'
}

/** 从 domPos "0=1=N=0#x" 解析段落索引 N；无效返回 -1。对齐 Vue pos-info.js:182 */
export function getParagraphIndexFromDomPos(domPos: string | null | undefined): number {
  if (!domPos) {
    return -1
  }
  const parts = domPos.split('=')
  const index = parseInt(parts[2], 10)
  return Number.isFinite(index) ? index : -1
}

function findParagraphIndex(node: Node, rootEl: Element): number {
  let current: Node | null = node
  while (current && current !== rootEl) {
    if ((current as Element).nodeType === Node.ELEMENT_NODE && (current as Element).tagName === 'P') {
      const paragraphs = rootEl.querySelectorAll('p')
      return Array.prototype.indexOf.call(paragraphs, current)
    }
    current = current.parentNode
  }
  return 0
}

/** 由 Range 起点所在段落构造 domPosBase "0=1={paragraphIndex}=0"。对齐 Vue pos-info.js:203 */
export function buildDomPosBaseFromRange(range: Range | null, rootEl: Element | null): string {
  if (!range || !rootEl) {
    return '0=1=7=0'
  }

  const anchorNode = range.startContainer
  const paragraphIndex = findParagraphIndex(anchorNode, rootEl)
  return `0=1=${paragraphIndex}=0`
}

export interface HighlightPosEntry {
  p: string
  i: number
  v: number
}

export interface BuildPosInfoFromHighlightPosListResult {
  text: string
  posInfo: Record<string, number>
  domPosBase: string
}

/** 由高亮项列表（{p,i,v}）还原 { text, posInfo, domPosBase }。对齐 Vue pos-info.js:213 */
export function buildPosInfoFromHighlightPosList(
  list: HighlightPosEntry[] | null | undefined
): BuildPosInfoFromHighlightPosListResult {
  if (!list?.length) {
    return { text: '', posInfo: {}, domPosBase: '0=1=0=0' }
  }

  const text = list.map(item => String.fromCharCode(item.v)).join('')
  const posInfo: Record<string, number> = {}

  list.forEach(item => {
    posInfo[`${item.p}#${item.i}`] = item.v
  })

  const domPosBase = itemPathToDomPosBase(list[0].p)

  return { text, posInfo, domPosBase }
}

function itemPathToDomPosBase(path: string): string {
  if (!path) {
    return '0=1=0=0'
  }
  const parts = path.split('=')
  if (parts.length >= 3) {
    return parts.slice(0, 3).join('=')
  }
  return path
}

export interface BuildPosInfoFromRangeResult {
  text: string
  posInfo: Record<string, number>
  domPosBase: string
}

/** 由 Range 构造 { text, posInfo, domPosBase }（text=range.toString，posInfo 按 charCode 编码）。对齐 Vue pos-info.js:241 */
export function buildPosInfoFromRange(range: Range | null, rootEl: Element | null): BuildPosInfoFromRangeResult {
  if (!range || range.collapsed) {
    return { text: '', posInfo: {}, domPosBase: '0=1=7=0' }
  }

  const text = range.toString()
  const domPosBase = buildDomPosBaseFromRange(range, rootEl)
  const posInfo = buildPosInfoFromText(text, domPosBase)

  return { text, posInfo, domPosBase }
}

export interface RangeRect {
  top: number
  left: number
  width: number
  height: number
}

/** 取 Range 的并集屏幕矩形（getBoundingClientRect 为空时回退 getClientRects 合并）。对齐 Vue pos-info.js:253 */
export function getRangeRect(range: Range | null): RangeRect | null {
  if (!range || range.collapsed) {
    return null
  }

  const rect = range.getBoundingClientRect()
  if (rect.width || rect.height) {
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    }
  }

  const clientRects = range.getClientRects()
  if (!clientRects.length) {
    return null
  }

  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity

  Array.from(clientRects).forEach(item => {
    top = Math.min(top, item.top)
    left = Math.min(left, item.left)
    right = Math.max(right, item.right)
    bottom = Math.max(bottom, item.bottom)
  })

  return {
    top,
    left,
    width: right - left,
    height: bottom - top
  }
}
