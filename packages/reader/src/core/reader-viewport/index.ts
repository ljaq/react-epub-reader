/**
 * 阅读器视口宽度测量。
 *
 * 源码对照：old-vue-reader/utils/reader-viewport.js:1-76
 *
 * 注意：width=398 是无 window 时的最终回退值（Vue 默认）。
 * HORIZONTAL_VIEWPORT_PADDING_X=50 用于 rootEl 回退宽度。
 */

export const HORIZONTAL_VIEWPORT_PADDING_X = 50

/** 测量阅读器正文容器宽度（clientWidth 减左右 padding）。对齐 Vue reader-viewport.js:3 */
export function getReaderContentWidth(viewportEl: Element | null): number {
  if (viewportEl) {
    const style = window.getComputedStyle(viewportEl)
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    const width = viewportEl.clientWidth - paddingLeft - paddingRight
    if (width > 0) {
      return width
    }
  }

  return getReaderContentWidthFallback()
}

/** 无 viewport 时的回退宽度：min(innerWidth,innerHeight)-32；无 window 时 398（Vue 默认）。对齐 Vue reader-viewport.js:17 */
export function getReaderContentWidthFallback(): number {
  if (typeof window !== 'undefined') {
    return Math.min(window.innerWidth, window.innerHeight) - 32
  }

  return 398
}

export interface ResolveChapterFetchWidthOptions {
  viewportEl?: Element | null
  rootEl?: Element | null
}

/** 取章节拉取宽度：优先 viewport，回退 rootEl.clientWidth-50，最终回退 fallback。对齐 Vue reader-viewport.js:25 */
export function resolveChapterFetchWidth({ viewportEl, rootEl }: ResolveChapterFetchWidthOptions = {}): number {
  const viewportWidth = getReaderContentWidth(viewportEl || null)
  if (viewportEl && viewportWidth > 0 && viewportEl.clientWidth > 0) {
    return viewportWidth
  }

  if (rootEl && rootEl.clientWidth > 0) {
    return Math.max(rootEl.clientWidth - HORIZONTAL_VIEWPORT_PADDING_X, 280)
  }

  return getReaderContentWidthFallback()
}

export interface WaitForReaderContentWidthOptions {
  timeoutMs?: number
  intervalMs?: number
  stableTicks?: number
}

/** 轮询等待正文宽度稳定（连续 stableTicks 次相同值或超时），用于布局就绪后再分页。对齐 Vue reader-viewport.js:38 */
export function waitForReaderContentWidth(
  viewportEl: Element | null,
  { timeoutMs = 3000, intervalMs = 50, stableTicks = 2 }: WaitForReaderContentWidthOptions = {}
): Promise<number> {
  return new Promise(resolve => {
    const started = Date.now()
    let lastWidth = 0
    let stableCount = 0

    const finish = (width: number) => {
      resolve(Math.max(width, 0) || getReaderContentWidthFallback())
    }

    const tick = () => {
      const width = viewportEl ? getReaderContentWidth(viewportEl) : 0
      const viewportReady = !viewportEl || viewportEl.clientWidth > 0

      if (width > 0 && viewportReady) {
        if (width === lastWidth) {
          stableCount += 1
        } else {
          stableCount = 0
          lastWidth = width
        }

        if (stableCount >= stableTicks) {
          finish(width)
          return
        }
      }

      if (Date.now() - started >= timeoutMs) {
        finish(getReaderContentWidth(viewportEl))
        return
      }

      window.setTimeout(tick, intervalMs)
    }

    tick()
  })
}
