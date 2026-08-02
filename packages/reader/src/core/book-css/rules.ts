/**
 * 书 CSS 规则类名解析。
 *
 * 源码对照：old-vue-reader/utils/book-css-rules.js:1-40
 */

import BOOK_CSS_RULE_MAP from './rules.generated.json'

const VERTICAL_EXCLUDE_BOOK_IDS = [
  '11246949',
  '11007369',
  '11520255',
  '11526202',
  '11526169',
  '11611407',
  '11624697',
  '11668540'
]

/** 取书 CSS 规则类名（rules.generated.json 命中 + 无 mainbody 加 read_rule_c + 非 EXCLUDE 加 read_rule_vertical）。对齐 Vue book-css-rules.js:14 */
export function getBookCssRuleClasses(bookId: number | string, rootEl: Element | Document | null): string[] {
  const id = String(bookId || '')
  const cssRuleArr = [...((BOOK_CSS_RULE_MAP as Record<string, string[]>)[id] || [])]
  const scope = rootEl || (typeof document !== 'undefined' ? document : null)

  if (scope && !scope.querySelector('.h5_mainbody_bg') && !scope.querySelector('.h5_mainbody')) {
    cssRuleArr.push('read_rule_c')
  }

  if (VERTICAL_EXCLUDE_BOOK_IDS.indexOf(id) === -1 && cssRuleArr.indexOf('read_rule_cover5') === -1) {
    cssRuleArr.push('read_rule_vertical')
  }

  return cssRuleArr
}

/** 应用规则类名到 element：保留非 read_rule_ 类，追加 read_c + 规则类。对齐 Vue book-css-rules.js:30 */
export function applyBookCssRuleClasses(
  element: Element | null,
  bookId: number | string,
  rootEl: Element | Document | null
): string[] {
  if (!element) {
    return []
  }

  const ruleClasses = getBookCssRuleClasses(bookId, rootEl)
  const keepClasses = Array.from(element.classList).filter(
    name => !name.startsWith('read_rule_') && name !== 'read_c'
  )

  element.className = [...keepClasses, 'read_c', ...ruleClasses].join(' ')
  return ruleClasses
}
