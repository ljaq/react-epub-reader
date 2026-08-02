/**
 * 书 CSS 注入与卸载。
 *
 * 源码对照：old-vue-reader/utils/book-css.js:1-85
 */

const READER_CSS_MARKER = 'data-reader-book-css'
const READER_APPEND_CSS_MARKER = 'data-reader-book-append-css'
export const READER_OTHER_LINK_CLASS = 'otherLink'

function normalizeCssUrl(item: unknown): string {
  if (!item) {
    return ''
  }
  if (typeof item === 'string') {
    return item.trim()
  }
  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>
    return String(obj.url || obj.href || obj.src || obj.link || obj.cssUrl || obj.path || '').trim()
  }
  return ''
}

/** 归一化 CSS 列表（支持 string/{url} 对象），去重。对齐 Vue book-css.js:18 */
export function normalizeCssLists(cssLists: unknown): string[] {
  if (!cssLists) {
    return []
  }
  const list = Array.isArray(cssLists) ? cssLists : [cssLists]
  const urls = list.map(normalizeCssUrl).filter(Boolean)
  return [...new Set(urls)]
}

export interface HasExternalBookCssInput {
  cssLists?: unknown
  appendCss?: string
}

/** 是否存在外部书 CSS（cssLists 非空或有 appendCss）。对齐 Vue book-css.js:27 */
export function hasExternalBookCss({ cssLists, appendCss }: HasExternalBookCssInput = {}): boolean {
  return normalizeCssLists(cssLists).length > 0 || Boolean(appendCss)
}

function injectAppendCss(appendCss: string, bookId: number | string, head: HTMLElement): void {
  if (!appendCss) {
    return
  }

  const style = document.createElement('style')
  style.setAttribute(READER_APPEND_CSS_MARKER, String(bookId))
  style.textContent = appendCss
  head.appendChild(style)
}

export interface LoadBookCssInput {
  cssLists?: unknown
  appendCss?: string
}

/** 注入书 CSS：先 unload 旧的，再按 cssLists 注入 link，最后注入 appendCss style。对齐 Vue book-css.js:42 */
export function loadBookCss({ cssLists, appendCss }: LoadBookCssInput = {}, bookId: number | string): void {
  if (typeof document === 'undefined' || typeof bookId === 'undefined' || bookId === null) {
    return
  }

  unloadBookCss(bookId)

  const head = document.head || document.getElementsByTagName('head')[0]
  if (!head) {
    return
  }

  normalizeCssLists(cssLists).forEach((href, index) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.className = READER_OTHER_LINK_CLASS
    link.setAttribute(READER_CSS_MARKER, String(bookId))
    link.setAttribute('data-reader-css-index', String(index))
    head.appendChild(link)
  })

  injectAppendCss(appendCss || '', bookId, head as HTMLElement)
}

/** 移除指定 bookId 的所有 link/style（CSS 注入清理）。对齐 Vue book-css.js:67 */
export function unloadBookCss(bookId: number | string): void {
  if (typeof document === 'undefined' || typeof bookId === 'undefined' || bookId === null) {
    return
  }

  const linkSelector = `link[${READER_CSS_MARKER}="${bookId}"]`
  document.querySelectorAll(linkSelector).forEach(node => {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
  })

  const styleSelector = `style[${READER_APPEND_CSS_MARKER}="${bookId}"]`
  document.querySelectorAll(styleSelector).forEach(node => {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
  })
}

export { applyBookCssClear } from './clear'
export { applyBookCssRuleClasses, getBookCssRuleClasses } from './rules'
