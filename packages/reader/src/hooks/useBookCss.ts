/**
 * 书籍 CSS 注入与正文规则同步。
 *
 * 源码对照：
 * - old-vue-reader/index.vue applyBookMeta → loadBookCss
 * - old-vue-reader/components/ReaderContent/index.vue syncBookCssRules:1443
 */
import { useCallback, useEffect } from 'react'
import type { BookMeta } from '../types'
import {
  applyBookCssClear,
  applyBookCssRuleClasses,
  hasExternalBookCss,
  loadBookCss,
  unloadBookCss,
  type HasExternalBookCssInput
} from '../core/book-css'

type BookMetaWithCss = BookMeta & HasExternalBookCssInput

export interface UseBookCssInput {
  bookId: number
  bookMeta: BookMeta
  getContentBodies: () => Element[]
  getScrollRoot: () => HTMLElement | null
  /** 内容变更时递增以触发 sync */
  contentRevision?: unknown
}

export function useBookCss(input: UseBookCssInput): void {
  const { bookId, bookMeta, getContentBodies, getScrollRoot, contentRevision } = input
  const metaWithCss = bookMeta as BookMetaWithCss

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (hasExternalBookCss(metaWithCss)) {
      loadBookCss(metaWithCss, bookId)
    }
    return () => {
      unloadBookCss(bookId)
    }
  }, [bookId, metaWithCss.cssLists, metaWithCss.appendCss])

  const syncBookCssRules = useCallback(() => {
    if (!hasExternalBookCss(metaWithCss)) {
      return
    }
    const root = getScrollRoot()
    getContentBodies().forEach((body) => {
      applyBookCssRuleClasses(body, bookId, root)
      applyBookCssClear(bookId, body)
    })
  }, [bookId, metaWithCss, getContentBodies, getScrollRoot])

  useEffect(() => {
    syncBookCssRules()
  }, [syncBookCssRules, contentRevision])
}
