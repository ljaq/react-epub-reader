/**
 * 书签添加/删除乐观 UI — 对照 Vue TopBar addCurrentBookmark/removeCurrentBookmark:229-289。
 */
import { useCallback } from 'react'
import type { BookmarkItem, ChapterMeta } from '../types'
import type { BookmarkListItem } from '../store/bookmark-store'
import { encodeBookmarkSummary, generateBookmarkId } from '../core/reading-position'
import { findBookmarkAtSnapshot } from '../core/bookmark-match'
import { useBookmarkStore } from '../store/bookmark-store'
import { useReadingStore } from '../store/reading-store'
import { useUiStore } from '../store/ui-store'
import { computeReadingSnapshotFromDom, getScrollTop } from './useReadingSnapshot'

export interface BookmarkActionsOptions {
  bookId: number
  chapterId: number
  chapterList: ChapterMeta[]
  chapterBookmarks: BookmarkListItem[]
  horizontalEnabled: boolean
  pageIndex: number
  pageCount: number
  onBookmarkCreate?: (payload: BookmarkItem) => void
  onBookmarkDelete?: (payload: { bookId: number; chapterId: number; id: string }) => void
}

export function useBookmarkActions(options: BookmarkActionsOptions) {
  const showToast = useUiStore((s) => s.showToast)
  const addPendingBookmark = useBookmarkStore((s) => s.addPendingBookmark)
  const removePendingBookmark = useBookmarkStore((s) => s.removePendingBookmark)
  const updateReadingSnapshot = useReadingStore((s) => s.updateReadingSnapshot)

  const buildBookmarkPayload = useCallback(() => {
    const fresh = computeReadingSnapshotFromDom()
    let { domPos, summary, rawSummary, precent, strIdx } = fresh
    const { chapterId, chapterList, horizontalEnabled, pageIndex } = options

    if (!rawSummary && !summary) {
      const chapterName =
        chapterList.find((item) => Number(item.id) === Number(chapterId))?.chapterName || ''
      domPos = domPos || '0=1=0=0#0'
      precent = precent || 0
      strIdx = strIdx || 0
      summary = chapterName
      rawSummary = chapterName
    }

    const payload: Record<string, unknown> = {
      domPos,
      precent,
      summary: rawSummary || summary,
      strIdx: strIdx ?? 0
    }
    if (horizontalEnabled) {
      payload.pageIndex = pageIndex
    }
    return payload as {
      domPos: string
      precent: number
      summary: string
      strIdx: number
      pageIndex?: number
    }
  }, [options])

  const getCurrentBookmark = useCallback(() => {
    const snapshot = computeReadingSnapshotFromDom()
    return findBookmarkAtSnapshot(options.chapterBookmarks, snapshot, {
      horizontal: options.horizontalEnabled,
      pageCount: options.pageCount,
      pageIndex: options.pageIndex
    })
  }, [options.chapterBookmarks, options.horizontalEnabled, options.pageCount, options.pageIndex])

  const addCurrentBookmark = useCallback(() => {
    const payload = buildBookmarkPayload()
    const bookmarkId = generateBookmarkId(options.chapterId, payload.strIdx)
    const optimisticBookmark: BookmarkListItem = {
      id: bookmarkId,
      chapterId: options.chapterId,
      domPos: payload.domPos,
      summary: payload.summary,
      precent: payload.precent,
      strIdx: payload.strIdx,
      cur: options.horizontalEnabled ? options.pageIndex : 0,
      totalPage: options.pageCount,
      h5PageY: 0,
      time: '刚刚'
    }
    if (options.horizontalEnabled) {
      optimisticBookmark.pageIndex = payload.pageIndex
      optimisticBookmark.cur = payload.pageIndex ?? options.pageIndex
      optimisticBookmark.totalPage = options.pageCount
    }

    addPendingBookmark(options.chapterId, optimisticBookmark)
    showToast('添加书签成功')

    const bookmarkSummaryPayload: Record<string, unknown> = {
      ...payload,
      horizontal: options.horizontalEnabled,
      pageCount: options.pageCount
    }
    if (!options.horizontalEnabled) {
      bookmarkSummaryPayload.h5PageY = getScrollTop()
    }

    const createPayload: BookmarkItem = {
      ...optimisticBookmark,
      summary: encodeBookmarkSummary(bookmarkSummaryPayload)
    }

    try {
      options.onBookmarkCreate?.(createPayload)
      updateReadingSnapshot({
        domPos: payload.domPos,
        summary: payload.summary,
        precent: payload.precent,
        strIdx: payload.strIdx
      })
    } catch {
      removePendingBookmark(options.chapterId, bookmarkId)
      showToast('添加失败，请重试')
    }
  }, [
    buildBookmarkPayload,
    options,
    addPendingBookmark,
    removePendingBookmark,
    showToast,
    updateReadingSnapshot
  ])

  const removeCurrentBookmark = useCallback(() => {
    const bookmark = getCurrentBookmark()
    if (!bookmark) return

    const bookmarkSnapshot = { ...bookmark }
    removePendingBookmark(options.chapterId, bookmark.id)
    showToast('删除书签成功')

    try {
      options.onBookmarkDelete?.({
        bookId: options.bookId,
        chapterId: options.chapterId,
        id: bookmark.id
      })
    } catch {
      addPendingBookmark(options.chapterId, bookmarkSnapshot)
      showToast('删除失败，请重试')
    }
  }, [
    getCurrentBookmark,
    options,
    removePendingBookmark,
    addPendingBookmark,
    showToast
  ])

  return {
    getCurrentBookmark,
    addCurrentBookmark,
    removeCurrentBookmark,
    buildBookmarkPayload
  }
}
