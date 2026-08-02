/**
 * 阅读位置 — navTarget 构造与页码解析。
 *
 * 源码对照：old-vue-reader/utils/reading-position.js 中的
 * parseReadPositionSummary / resolvePageIndexFromNavTarget / resolveGoChapterInitialPageIndex /
 * isNavTargetPaginationReady / resolveDomPosNavTargetPageIndex / buildNavTargetFrom* /
 * resolveHorizontalPageFromLineMark / isDomPosOnlyNavTarget 等。
 */

import { calculatePagination } from '../pagination'
import { decodeBookmarkSummary, extractDomPosFromPosInfo, parseStrIdxFromBookmarkId } from './pos-info'
import {
  resolveHorizontalPageFromDomPos,
  resolveHorizontalPageFromStrIdx,
  resolveHorizontalPageFromSummary,
  resolveHorizontalPageIndexFromContentLeft,
  splitDomPos
} from './dom-match'

export interface NavTarget {
  chapterId?: number
  domPos?: string
  summary?: string
  strIdx?: number
  cur?: number
  totalPage?: number
  isLastPage?: boolean
  precent?: number
  h5PageY?: number
  pageIndex?: number
  textIdx?: number
  webLineId?: string
  paragraphCount?: number
  domPosBase?: string
  [key: string]: unknown
}

function hasValidPrecent(precent: number | undefined | null): boolean {
  return Number.isFinite(precent)
}

function applyOpenwapNavFields(navTarget: NavTarget, parsed: Record<string, unknown>): void {
  if (Number.isFinite(parsed.cur)) {
    navTarget.cur = Number(parsed.cur)
    navTarget.pageIndex = Number(parsed.cur)
  }
  if (Number.isFinite(parsed.totalPage)) {
    navTarget.totalPage = Number(parsed.totalPage)
  }
  if (typeof parsed.isLastPage === 'boolean') {
    navTarget.isLastPage = parsed.isLastPage
  }
  if (Number.isFinite(parsed.totalPage) && Number(parsed.totalPage) > 1 && Number.isFinite(parsed.cur)) {
    navTarget.precent = Number(parsed.cur) / (Number(parsed.totalPage) - 1)
  }
  if (Number.isFinite(parsed.h5PageY)) {
    navTarget.h5PageY = Number(parsed.h5PageY)
    if (!navTarget.precent && Number.isFinite(parsed.precent)) {
      navTarget.precent = Number(parsed.precent)
    }
  }
}

function normalizeText(text: string): string {
  return (text || '').replace(/\s+/gu, ' ').trim()
}

/** 解析阅读进度 summary JSON 为 navTarget（含 domPos/cur/totalPage/precent 等）。对齐 Vue reading-position.js:673 */
export function parseReadPositionSummary(summaryStr: string, chapterId: number): NavTarget | null {
  if (!summaryStr) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(summaryStr)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const obj = parsed as Record<string, unknown>
  const domPosBase = (obj.domPos as string) || '0=1=0=0'
  const curTextIdx = Number.isFinite(obj.curTextIdx) ? Number(obj.curTextIdx) : 0
  const navTarget: NavTarget = {
    chapterId: Number(obj.chapterId || chapterId),
    domPos: `${domPosBase}#${curTextIdx}`,
    summary: normalizeText((obj.summary as string) || '')
  }

  applyOpenwapNavFields(navTarget, obj)
  return navTarget
}

function isSavedNavTargetPaginationReady(navTarget: NavTarget, count: number): boolean {
  const savedTotal = Number(navTarget.totalPage)
  const savedCur = Number.isFinite(navTarget.cur)
    ? Number(navTarget.cur)
    : Number.isFinite(navTarget.pageIndex)
      ? Number(navTarget.pageIndex)
      : null

  if (Number.isFinite(savedTotal) && savedTotal > 1) {
    return count >= savedTotal
  }
  if (savedCur !== null && savedCur > 0 && count <= 1) {
    return false
  }
  return true
}

function resolveSavedPageIndex(navTarget: NavTarget, count: number): number | null {
  if (Number.isFinite(navTarget.cur)) {
    return Math.min(count - 1, Math.max(0, Number(navTarget.cur)))
  }
  if (Number.isFinite(navTarget.pageIndex)) {
    return Math.min(count - 1, Math.max(0, Number(navTarget.pageIndex)))
  }
  return null
}

function resolveStrIdxPageIndex(
  navTarget: NavTarget,
  count: number,
  bodyEl: Element | null,
  pageWidth: number
): number | null {
  if (!Number.isFinite(navTarget.strIdx) || !bodyEl || pageWidth <= 0) {
    return null
  }
  const strIdxPage = resolveHorizontalPageFromStrIdx(bodyEl, Number(navTarget.strIdx), pageWidth)
  if (strIdxPage === null) {
    return null
  }
  return Math.min(count - 1, Math.max(0, strIdxPage))
}

function resolveSummaryPageIndex(
  navTarget: NavTarget,
  count: number,
  bodyEl: Element | null,
  pageWidth: number
): number | null {
  if (!bodyEl || pageWidth <= 0 || !navTarget.summary) {
    return null
  }
  const summaryPage = resolveHorizontalPageFromSummary(bodyEl, navTarget.summary, pageWidth)
  if (summaryPage === null) {
    return null
  }
  return Math.min(count - 1, Math.max(0, summaryPage))
}

function resolveFallbackPageIndex(
  navTarget: NavTarget,
  count: number,
  bodyEl: Element | null,
  pageWidth: number
): number {
  const strIdxPage = resolveStrIdxPageIndex(navTarget, count, bodyEl, pageWidth)
  if (strIdxPage !== null) {
    return strIdxPage
  }

  const summaryPage = resolveSummaryPageIndex(navTarget, count, bodyEl, pageWidth)
  if (summaryPage !== null) {
    return summaryPage
  }

  if (bodyEl && pageWidth > 0) {
    const domPosPage = resolveHorizontalPageFromDomPos(bodyEl, navTarget.domPos || '', pageWidth)
    if (domPosPage !== null) {
      return Math.min(count - 1, Math.max(0, domPosPage))
    }
  }

  if (hasValidPrecent(navTarget.precent)) {
    const ratio = Math.min(1, Math.max(0, Number(navTarget.precent)))
    return Math.round(ratio * Math.max(0, count - 1))
  }

  const paragraphIndex = Number((navTarget.domPos || '').split('=')[2] || -1)
  if (Number.isFinite(paragraphIndex) && paragraphIndex >= 0) {
    const paragraphs = Math.max(1, navTarget.paragraphCount || 24)
    const ratio = Math.min(1, paragraphIndex / paragraphs)
    return Math.round(ratio * Math.max(0, count - 1))
  }

  return 0
}

export interface ResolvePageIndexOptions {
  bodyEl?: Element | null
  pageWidth?: number
}

/**
 * 由 navTarget + 当前分页数解析章内页码。优先信任 saved cur（当 savedTotal 已达到），
 * 否则走 fallback：strIdx→summary 文本匹配→domPos→precent→段落比例。对齐 Vue reading-position.js:791。
 */
export function resolvePageIndexFromNavTarget(
  navTarget: NavTarget | null,
  pageCount: number,
  options: ResolvePageIndexOptions = {}
): number {
  const count = Math.max(1, Number(pageCount) || 1)
  if (!navTarget) {
    return 0
  }

  const { bodyEl, pageWidth } = options
  if (isSavedNavTargetPaginationReady(navTarget, count)) {
    const savedPage = resolveSavedPageIndex(navTarget, count)
    if (savedPage !== null) {
      return savedPage
    }
  }

  return resolveFallbackPageIndex(navTarget, count, bodyEl || null, pageWidth || 0)
}

/** 跳章时取初始页码：仅信任 saved cur（无则 0，等分页稳定后由 retry 重定位）。对齐 Vue reading-position.js:811 */
export function resolveGoChapterInitialPageIndex(navTarget: NavTarget | null, existingPageCount: number): number {
  if (!navTarget) {
    return 0
  }
  const count = Math.max(1, Number(existingPageCount) || 1)
  const saved = resolveSavedPageIndex(navTarget, count)
  return saved !== null ? saved : 0
}

function hasNavTargetExplicitPosition(navTarget: NavTarget): boolean {
  return (
    Number.isFinite(navTarget.cur) ||
    Number.isFinite(navTarget.pageIndex) ||
    (Number.isFinite(navTarget.totalPage) && Number(navTarget.totalPage) > 1) ||
    hasValidPrecent(navTarget.precent) ||
    Boolean(navTarget.webLineId) ||
    Number.isFinite(navTarget.h5PageY) ||
    Number.isFinite(navTarget.strIdx) ||
    Boolean(navTarget.summary)
  )
}

/** 判断 navTarget 是否仅有 domPos（无 cur/strIdx/precent 等），需等分页量出多页才能定位。对齐 Vue reading-position.js:571 */
export function isDomPosOnlyNavTarget(navTarget: NavTarget | null): boolean {
  if (!navTarget?.domPos || !String(navTarget.domPos).includes('=')) {
    return false
  }
  return !hasNavTargetExplicitPosition(navTarget)
}

function isReliableDomPosForLiveFallback(domPos: string | undefined): boolean {
  if (!domPos) {
    return false
  }
  const charIndex = String(domPos).split('#')[1]
  return Boolean(charIndex) && charIndex !== '0'
}

function hasLiveDomFallback(navTarget: NavTarget | null): boolean {
  if (!navTarget) {
    return false
  }
  return Number.isFinite(navTarget.strIdx) || isReliableDomPosForLiveFallback(navTarget.domPos)
}

/** 判断 navTarget 在当前分页数下是否已可定位（避免 clamp 到错误页码）。对齐 Vue reading-position.js:621 */
export function isNavTargetPaginationReady(navTarget: NavTarget | null, pageCount: number): boolean {
  if (!navTarget) {
    return true
  }
  const count = Math.max(1, Number(pageCount) || 1)
  if (isDomPosOnlyNavTarget(navTarget)) {
    return count > 1
  }
  if (isSavedNavTargetPaginationReady(navTarget, count)) {
    const hasSavedCurOrTotal =
      Number.isFinite(navTarget.cur) ||
      Number.isFinite(navTarget.pageIndex) ||
      (Number.isFinite(navTarget.totalPage) && Number(navTarget.totalPage) > 1)
    if (hasSavedCurOrTotal) {
      return true
    }
    return count > 1
  }
  return count > 1 && hasLiveDomFallback(navTarget)
}

export interface ResolveDomPosNavTargetOptions {
  pageGap?: number
  viewportHeight?: number
}

/** 仅 domPos navTarget 在 buffer 多页时的精确页码（live 量页与 buffer 一致才返回，否则 null）。对齐 Vue reading-position.js:594 */
export function resolveDomPosNavTargetPageIndex(
  navTarget: NavTarget,
  bodyEl: Element,
  pageWidth: number,
  bufferPageCount: number,
  measureOptions: ResolveDomPosNavTargetOptions = {}
): number | null {
  if (!isDomPosOnlyNavTarget(navTarget) || !bodyEl || pageWidth <= 0) {
    return null
  }
  const bufferCount = Math.max(1, Number(bufferPageCount) || 1)
  if (bufferCount <= 1) {
    return null
  }
  const domPosPage = resolveHorizontalPageFromDomPos(bodyEl, navTarget.domPos || '', pageWidth)
  if (domPosPage === null) {
    return null
  }
  const liveCount = calculatePagination(bodyEl, pageWidth, measureOptions).pageCount
  if (liveCount !== bufferCount || domPosPage >= bufferCount) {
    return null
  }
  return domPosPage
}

/** resolveDomPosNavTargetPageIndex 的布尔版（是否已可应用）。对齐 Vue reading-position.js:617 */
export function isDomPosNavTargetApplyReady(
  navTarget: NavTarget,
  bodyEl: Element,
  pageWidth: number,
  bufferPageCount: number,
  measureOptions: ResolveDomPosNavTargetOptions = {}
): boolean {
  return resolveDomPosNavTargetPageIndex(navTarget, bodyEl, pageWidth, bufferPageCount, measureOptions) !== null
}

/** 由划线 mark 的最左 contentLeft 算横划页码（划线/批注跳转用）。对齐 Vue reading-position.js:533 */
export function resolveHorizontalPageFromLineMark(
  bodyEl: Element,
  webLineId: string,
  pageWidth: number
): number | null {
  if (!bodyEl || !webLineId || pageWidth <= 0) {
    return null
  }
  const marks = bodyEl.querySelectorAll(`[data-web-line-id="${webLineId}"]`)
  if (!marks.length) {
    return null
  }
  const bodyLeft = bodyEl.getBoundingClientRect().left
  let minContentLeft = Infinity
  marks.forEach(mark => {
    const contentLeft = mark.getBoundingClientRect().left - bodyLeft
    minContentLeft = Math.min(minContentLeft, contentLeft)
  })
  if (!Number.isFinite(minContentLeft)) {
    return null
  }
  return resolveHorizontalPageIndexFromContentLeft(minContentLeft, pageWidth)
}

interface LineItemLike {
  chapterId?: number
  posInfo?: Record<string, number>
  summary?: string
  webLineId?: string
  id?: string | number
}

/** 由划线条目构造 navTarget（含 webLineId，用于划线跳转 + waitForLineMark）。对齐 Vue reading-position.js:1020 */
export function buildNavTargetFromLineItem(item: LineItemLike | null): NavTarget | null {
  if (!item) {
    return null
  }
  const domPos = extractDomPosFromPosInfo(item.posInfo || {})
  const { domPosBase, curTextIdx } = splitDomPos(domPos)
  return {
    chapterId: item.chapterId,
    domPos,
    textIdx: curTextIdx,
    summary: item.summary || '',
    webLineId: item.webLineId || String(item.id || ''),
    domPosBase
  }
}

/** 由批注条目构造 navTarget（不带 webLineId，定位走 summary 文本匹配）。对齐 Vue reading-position.js:1038 */
export function buildNavTargetFromNoteItem(item: LineItemLike | null): NavTarget | null {
  const base = buildNavTargetFromLineItem(item)
  if (!base) {
    return null
  }
  const { webLineId, ...rest } = base
  return rest
}

interface BookmarkItemLike {
  id?: string
  chapterId?: number
  domPos?: string
  summary?: string
  precent?: number
  pageIndex?: number
  cur?: number
  totalPage?: number
  isLastPage?: boolean
  h5PageY?: number
  strIdx?: number
}

function buildBookmarkOpenwapFields(item: BookmarkItemLike, decoded: Record<string, unknown>): Record<string, unknown> {
  return {
    cur: item.cur ?? decoded.cur ?? item.pageIndex,
    totalPage: item.totalPage ?? decoded.totalPage,
    isLastPage: item.isLastPage ?? decoded.isLastPage,
    precent: item.precent ?? decoded.precent,
    h5PageY: item.h5PageY ?? decoded.h5PageY
  }
}

function resolveBookmarkStrIdx(item: BookmarkItemLike, decoded: Record<string, unknown>): number | null {
  return item.strIdx ?? parseStrIdxFromBookmarkId(item.id) ?? (decoded.strIdx as number | null)
}

/** 由书签条目构造 navTarget（合并 item 字段与 summary 解码字段）。对齐 Vue reading-position.js:1065 */
export function buildNavTargetFromBookmarkItem(item: BookmarkItemLike | null): NavTarget | null {
  if (!item) {
    return null
  }
  const decoded = decodeBookmarkSummary(item.summary) as Record<string, unknown>
  const navTarget: NavTarget = {
    chapterId: item.chapterId,
    domPos: item.domPos || (decoded.domPos as string) || '0=1=0=0#0',
    summary: normalizeText((decoded.summary as string) || item.summary || ''),
    precent: (item.precent ?? decoded.precent) as number | undefined,
    pageIndex: (item.pageIndex ?? item.cur ?? decoded.cur) as number | undefined,
    h5PageY: (item.h5PageY ?? decoded.h5PageY) as number | undefined,
    strIdx: resolveBookmarkStrIdx(item, decoded) ?? undefined
  }

  applyOpenwapNavFields(navTarget, buildBookmarkOpenwapFields(item, decoded))
  return navTarget
}
