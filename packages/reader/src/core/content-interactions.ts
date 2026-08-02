/**
 * 正文富媒体交互判定 — 图片预览 / 脚注。
 *
 * 源码对照：old-vue-reader/utils/reader-content-interactions.js（39 行，全文）
 */

const FOOTNOTE_CLASSES = ['zhangyue-footnote', 'zhangyue-footnote-s']

export function isFootnoteImage(el: Element | null): boolean {
  if (!el || el.nodeName !== 'IMG') {
    return false
  }
  return FOOTNOTE_CLASSES.some((className) => el.classList.contains(className))
}

export function isPreviewableImage(el: Element | null): boolean {
  if (!el || el.nodeName !== 'IMG') {
    return false
  }
  if (isFootnoteImage(el)) {
    return false
  }
  return Boolean((el as HTMLImageElement).src)
}

export function resolvePreviewImageUrl(el: Element | null): string {
  return (el as HTMLImageElement | null)?.src || ''
}

export function resolveFootnoteText(el: Element | null): string {
  return el?.getAttribute('zy-footnote') || ''
}

export interface AnchorRect {
  left: number
  top: number
  width: number
  height: number
}

export function resolveAnchorRect(el: Element | null): AnchorRect | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') {
    return null
  }
  const rect = el.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }
}

/** 正文链接：排除章导航按钮等区域 */
export function resolveContentLink(el: Element | null): HTMLAnchorElement | null {
  if (!el) return null
  const anchor = el.closest('a')
  if (!anchor || anchor.closest('.reader-chapter-btn')) {
    return null
  }
  return anchor
}
