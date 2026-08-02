/**
 * 分页计算纯函数。
 *
 * 源码对照：old-vue-reader/utils/pagination.js:1-283
 *
 * 关键常量（与 Vue 逐字对照，不得改写）：
 * - PAGE_COLUMN_GAP = 40（pagination.js:1）
 * - REMAINDER_TRIM_THRESHOLD = 4（pagination.js:2）
 */

export const PAGE_COLUMN_GAP = 40
const REMAINDER_TRIM_THRESHOLD = 4

const TREEWALKER_SHOW_ELEMENT =
  typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_ELEMENT : 1
const TREEWALKER_SHOW_TEXT = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4
const FILTER_REJECT = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_REJECT : 2
const FILTER_ACCEPT = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_ACCEPT : 1
const FILTER_SKIP = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_SKIP : 3
const TEXT_NODE = typeof Node !== 'undefined' ? Node.TEXT_NODE : 3
const ELEMENT_NODE = typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1

/** 将页码 clamp 到 [0, pageCount-1]；非法/负值归 0。对齐 Vue pagination.js:11 */
export function clampPageIndex(index: number, pageCount: number): number {
  const total = Math.max(1, pageCount)
  const value = Number(index)
  if (Number.isNaN(value) || value < 0) {
    return 0
  }
  if (value >= total) {
    return total - 1
  }
  return value
}

/** 一页的步长 = 页宽 + 列间距（横划分页基础量）。对齐 Vue pagination.js:23 */
export function getPageStride(pageWidth: number, pageGap: number = PAGE_COLUMN_GAP): number {
  return pageWidth + pageGap
}

function isInsideDecorator(node: Node, rootEl: Element): boolean {
  const doc = rootEl?.ownerDocument || (typeof document !== 'undefined' ? document : null)
  const stopNode: Element | null = doc?.body || null
  let current: Node | null = node
  while (current && current !== rootEl && current !== stopNode) {
    if ((current as Element).nodeType === ELEMENT_NODE) {
      const el = current as Element
      if (el.classList?.contains('reader-line-mark') || el.classList?.contains('reader-note-mark')) {
        return true
      }
    }
    current = current.parentNode
  }
  return false
}

function getNodeExtentRect(node: Node, doc: Document | null): DOMRect | null {
  if (!node || !doc) {
    return null
  }

  if ((node as Element).nodeType === ELEMENT_NODE && typeof (node as Element).getBoundingClientRect === 'function') {
    return (node as Element).getBoundingClientRect()
  }

  if ((node as Text).nodeType === TEXT_NODE && typeof doc.createRange === 'function') {
    const range = doc.createRange()
    try {
      range.selectNodeContents(node)
      return range.getBoundingClientRect()
    } catch {
      return null
    }
  }

  return null
}

/**
 * 测量正文内容的实际占用宽度（TreeWalker 遍历文本/IMG，跳过划线/批注 mark）。
 * 用于分页时取 scrollWidth 与 extentWidth 的较小值，避免 phantom 空白页。
 * 对齐 Vue pagination.js:65。jsdom 无布局时回退 scrollWidth。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getContentExtentWidth(contentEl: Element | null, pageWidth: number): number {
  if (!contentEl || pageWidth <= 0) {
    return Math.max(pageWidth, 0)
  }

  const doc: Document | null = contentEl.ownerDocument || (typeof document !== 'undefined' ? document : null)
  if (!doc || typeof doc.createTreeWalker !== 'function') {
    return Math.max((contentEl as HTMLElement).scrollWidth || pageWidth, pageWidth)
  }

  const containerRect = (contentEl as HTMLElement).getBoundingClientRect()
  const left = containerRect.left
  let maxRight = left + pageWidth

  const walker = doc.createTreeWalker(contentEl, TREEWALKER_SHOW_ELEMENT | TREEWALKER_SHOW_TEXT, {
    acceptNode(node) {
      if ((node as Text).nodeType === TEXT_NODE) {
        if (!(node as Text).textContent?.trim()) {
          return FILTER_REJECT
        }
        if (isInsideDecorator(node, contentEl)) {
          return FILTER_REJECT
        }
        return FILTER_ACCEPT
      }

      if ((node as Element).tagName === 'IMG') {
        return FILTER_ACCEPT
      }

      return FILTER_SKIP
    }
  })

  let node = walker.nextNode()
  while (node) {
    const rect = getNodeExtentRect(node, doc)
    if (rect && (rect.width > 0 || rect.height > 0)) {
      maxRight = Math.max(maxRight, rect.right)
    }
    node = walker.nextNode()
  }

  return Math.max(maxRight - left, pageWidth)
}

/**
 * 归一化 scrollWidth：当 (width+gap) % stride 余量 ≤ REMAINDER_TRIM_THRESHOLD(4) 时裁掉余量，
 * 消除亚像素误差导致的 phantom 空白页。对齐 Vue pagination.js:111。
 */
export function normalizeScrollWidth(effectiveWidth: number, stride: number, pageGap: number): number {
  if (effectiveWidth <= 0) {
    return 0
  }

  const remainder = (effectiveWidth + pageGap) % stride
  if (remainder <= REMAINDER_TRIM_THRESHOLD) {
    return effectiveWidth - remainder
  }

  return effectiveWidth
}

function trimEmptyTrailingPages(
  pageCount: number,
  scrollWidth: number,
  stride: number,
  pageGap: number,
  pageWidth: number
): number {
  let count = Math.max(1, pageCount)
  const minTailWidth = Math.max(pageGap + 8, Math.min(pageWidth, stride - pageGap) * 0.12)

  while (count > 1) {
    const tailWidth = scrollWidth - (count - 1) * stride
    if (tailWidth > minTailWidth) {
      break
    }
    count -= 1
  }

  return count
}

export interface PaginationResult {
  pageCount: number
  pageWidth: number
  pageGap: number
  pageStride: number
}

export interface CalculatePaginationOptions {
  pageGap?: number
  viewportHeight?: number
}

/**
 * 计算章节分页结果。规则（对齐 Vue pagination.js:139）：
 * - 无效输入 → 单页回退；stride+2 内 → 单页；
 * - 竖滚且内容高度 ≤ viewport 且宽度 ≤ stride*1.5 → 单页；
 * - 否则 ceil(width/stride) 后 trimEmptyTrailingPages 去章末 phantom 空白页。
 */
export function calculatePagination(
  contentEl: Element | null,
  pageWidth: number,
  options: CalculatePaginationOptions = {}
): PaginationResult {
  const pageGap = typeof options.pageGap === 'number' ? options.pageGap : PAGE_COLUMN_GAP
  const viewportHeight = options.viewportHeight || 0

  if (!contentEl || pageWidth <= 0) {
    return {
      pageCount: 1,
      pageWidth: Math.max(pageWidth, 0),
      pageGap,
      pageStride: getPageStride(Math.max(pageWidth, 0), pageGap)
    }
  }

  const stride = getPageStride(pageWidth, pageGap)
  const scrollWidth = (contentEl as HTMLElement).scrollWidth
  const scrollHeight = (contentEl as HTMLElement).scrollHeight
  const contentWidth = getContentExtentWidth(contentEl, pageWidth)
  const effectiveWidth = Math.min(scrollWidth, contentWidth)
  const normalizedWidth = normalizeScrollWidth(effectiveWidth, stride, pageGap)

  if (normalizedWidth <= stride + 2) {
    return {
      pageCount: 1,
      pageWidth,
      pageGap,
      pageStride: stride
    }
  }

  if (viewportHeight > 0 && scrollHeight <= viewportHeight + 2 && normalizedWidth <= stride * 1.5) {
    return {
      pageCount: 1,
      pageWidth,
      pageGap,
      pageStride: stride
    }
  }

  let pageCount = Math.max(1, Math.ceil(normalizedWidth / stride))
  pageCount = trimEmptyTrailingPages(pageCount, normalizedWidth, stride, pageGap, pageWidth)

  return {
    pageCount,
    pageWidth,
    pageGap,
    pageStride: stride
  }
}

/** 横划 track 的 translateX = -globalPageIndex×stride + dragOffset。对齐 Vue pagination.js:188 */
export function getTrackTranslateX(globalPageIndex: number, pageStride: number, dragOffset: number = 0): number {
  if (pageStride <= 0) {
    return dragOffset
  }
  return -globalPageIndex * pageStride + dragOffset
}

/**
 * 全局拖拽阻尼：首/末页处施加阻力（allowBookOverscroll 时 0.35，否则 0.2），中间页不阻尼。
 * 对齐 Vue pagination.js:195。
 */
export function applyGlobalDragResistance(
  dragOffset: number,
  globalPageIndex: number,
  totalPages: number,
  allowBookOverscroll: boolean = false
): number {
  const atFirst = globalPageIndex <= 0 && dragOffset > 0
  const atLast = globalPageIndex >= totalPages - 1 && dragOffset < 0

  if (atFirst || atLast) {
    if (allowBookOverscroll) {
      return dragOffset * 0.35
    }
    return dragOffset * 0.2
  }
  return dragOffset
}

export type DragTurnResult = 'stay' | 'next-page' | 'prev-page'

/** 判定全局拖拽是否触发翻页（阈值默认 40px）。对齐 Vue pagination.js:208 */
export function resolveGlobalDragTurn(
  globalPageIndex: number,
  totalPages: number,
  deltaX: number,
  threshold: number = 40
): DragTurnResult {
  if (Math.abs(deltaX) < threshold) {
    return 'stay'
  }

  if (deltaX < 0) {
    if (globalPageIndex < totalPages - 1) {
      return 'next-page'
    }
    return 'stay'
  }

  if (globalPageIndex > 0) {
    return 'prev-page'
  }
  return 'stay'
}

/** 章内拖拽阻尼，转发 applyGlobalDragResistance。对齐 Vue pagination.js:226 */
export function applyDragResistance(
  dragOffset: number,
  pageIndex: number,
  pageCount: number,
  allowChapterOverscroll: boolean = false
): number {
  return applyGlobalDragResistance(dragOffset, pageIndex, pageCount, allowChapterOverscroll)
}

/** 判定章内拖拽是否触发翻页，转发 resolveGlobalDragTurn。对齐 Vue pagination.js:230 */
export function resolveDragTurn(
  pageIndex: number,
  pageCount: number,
  deltaX: number,
  threshold: number = 40
): DragTurnResult {
  return resolveGlobalDragTurn(pageIndex, pageCount, deltaX, threshold)
}

/** setTimeout Promise 封装。对齐 Vue pagination.js:234 */
export function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * 等待 segment 内所有 img 加载完成（load/error 均计数），超时强制结束。
 * 用于分页前确保图片撑开布局。对齐 Vue pagination.js:240。
 */
export function waitForSegmentImages(rootEl: Element | null, timeoutMs: number = 3000): Promise<void> {
  if (!rootEl) {
    return Promise.resolve()
  }

  const images = Array.from(rootEl.querySelectorAll('img'))
  if (!images.length) {
    return Promise.resolve()
  }

  return new Promise<void>(resolve => {
    let pending = 0
    let settled = false
    const timer = window.setTimeout(finish, timeoutMs)

    function finish(): void {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      resolve()
    }

    images.forEach(img => {
      if (img.complete) {
        return
      }
      pending += 1
      const done = (): void => {
        pending -= 1
        if (pending <= 0) {
          finish()
        }
      }
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
    })

    if (pending <= 0) {
      finish()
    }
  })
}
