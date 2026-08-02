import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyBookCssClear,
  applyBookCssRuleClasses,
  getBookCssRuleClasses,
  loadBookCss,
  normalizeCssLists,
  hasExternalBookCss,
  READER_OTHER_LINK_CLASS,
  unloadBookCss
} from '../book-css'

describe('book-css rules', () => {
  it('getBookCssRuleClasses 已知 bookId 命中规则 + read_rule_vertical', () => {
    // 10119602 → read_rule_bg6（rules.generated.json）
    const classes = getBookCssRuleClasses('10119602', null)
    expect(classes).toContain('read_rule_bg6')
    expect(classes).toContain('read_rule_vertical')
  })

  it('getBookCssRuleClasses VERTICAL_EXCLUDE 命中不加 vertical', () => {
    // 11246949 在排除列表 → 不加 read_rule_vertical
    const classes = getBookCssRuleClasses('11246949', null)
    expect(classes).not.toContain('read_rule_vertical')
  })

  it('getBookCssRuleClasses 未知 bookId 仅默认', () => {
    const classes = getBookCssRuleClasses('99999999', null)
    expect(classes).toContain('read_rule_vertical')
    // 无 mainbody 时额外加 read_rule_c
    expect(classes).toContain('read_rule_c')
    expect(classes.length).toBe(2)
  })

  it('applyBookCssRuleClasses 应用到 element', () => {
    const el = document.createElement('div')
    el.className = 'custom-cls'
    const applied = applyBookCssRuleClasses(el, '10119602', null)
    expect(applied).toContain('read_rule_bg6')
    expect(el.classList.contains('read_c')).toBe(true)
    expect(el.classList.contains('custom-cls')).toBe(true)
  })
})

describe('book-css load/unload', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('normalizeCssLists 去重 + 归一化', () => {
    expect(normalizeCssLists(['a.css', 'a.css', { url: 'b.css' }])).toEqual(['a.css', 'b.css'])
    expect(normalizeCssLists(null)).toEqual([])
  })

  it('hasExternalBookCss', () => {
    expect(hasExternalBookCss({ cssLists: ['a.css'] })).toBe(true)
    expect(hasExternalBookCss({ appendCss: 'body{}' })).toBe(true)
    expect(hasExternalBookCss({})).toBe(false)
  })

  it('loadBookCss / unloadBookCss 注入与移除 link/style', () => {
    loadBookCss({ cssLists: ['a.css', 'b.css'], appendCss: 'body{color:red}' }, 123)
    const links = document.querySelectorAll(`link[data-reader-book-css="123"]`)
    expect(links.length).toBe(2)
    expect(links[0].className).toBe(READER_OTHER_LINK_CLASS)
    expect(document.querySelector('style[data-reader-book-append-css="123"]')).not.toBeNull()
    unloadBookCss(123)
    expect(document.querySelectorAll('link[data-reader-book-css="123"]').length).toBe(0)
    expect(document.querySelector('style[data-reader-book-append-css="123"]')).toBeNull()
  })
})

describe('book-css clear', () => {
  it('applyBookCssClear 无 scope 不抛错', () => {
    expect(() => applyBookCssClear('10119602', null)).not.toThrow()
  })

  it('applyBookCssClear 移除 read_rule_c（含 mainbody）', () => {
    const scope = document.createElement('div')
    scope.innerHTML = '<div class="h5_mainbody"></div>'
    scope.classList.add('read_rule_c')
    document.body.appendChild(scope)
    applyBookCssClear('10119602', scope)
    expect(scope.classList.contains('read_rule_c')).toBe(false)
  })
})
