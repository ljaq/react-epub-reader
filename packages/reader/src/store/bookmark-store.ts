/**
 * 书签乐观 UI store — pending 按 BookmarkItem.id 匹配（无 clientId）。
 */
import { create } from 'zustand'
import type { BookmarkItem } from '../types'
import { decodeBookmarkSummary, parseStrIdxFromBookmarkId } from '../core/reading-position'

/** UI 展示用（Vue 列表含 time，契约 BookmarkItem 未冻结该字段） */
export type BookmarkListItem = BookmarkItem & { time?: string }

/** 规范化书签字段（decode summary JSON）。对齐 Vue normalizeBookmarkItem:53 */
export function normalizeBookmarkItem(item: BookmarkItem, chapterId: number): BookmarkListItem {
  const decoded = decodeBookmarkSummary(item.summary)
  const rawSummary = item.summary
  const isPlainSummary = typeof rawSummary === 'string' && !rawSummary.trim().startsWith('{')
  const displaySummary = decoded.summary || (isPlainSummary ? rawSummary : '')

  return {
    ...item,
    chapterId: Number(chapterId),
    domPos: item.domPos || decoded.domPos || '0=1=0=0#0',
    precent: item.precent ?? decoded.precent ?? 0,
    pageIndex: item.pageIndex ?? decoded.cur ?? undefined,
    cur: item.cur ?? decoded.cur ?? 0,
    totalPage: item.totalPage ?? decoded.totalPage ?? 1,
    h5PageY: item.h5PageY ?? decoded.h5PageY ?? 0,
    strIdx: item.strIdx ?? decoded.strIdx ?? parseStrIdxFromBookmarkId(item.id),
    summary: displaySummary
  }
}

function mergeBookmarkItems(incoming: BookmarkListItem[], existing: BookmarkListItem[]): BookmarkListItem[] {
  const existingById: Record<string, BookmarkListItem> = {}
  ;(existing || []).forEach((item) => {
    existingById[item.id] = item
  })

  return (incoming || []).map((incomingItem) => {
    const prev = existingById[incomingItem.id]
    if (!prev) return incomingItem
    return {
      ...incomingItem,
      pageIndex: prev.pageIndex ?? incomingItem.pageIndex,
      precent: prev.precent ?? incomingItem.precent,
      cur: prev.cur ?? incomingItem.cur,
      totalPage: prev.totalPage ?? incomingItem.totalPage,
      h5PageY: prev.h5PageY ?? incomingItem.h5PageY
    }
  })
}

interface BookmarkState {
  pendingBookmarks: Record<number, BookmarkListItem[]>

  addPendingBookmark: (chapterId: number, item: BookmarkListItem) => void
  removePendingBookmark: (chapterId: number, id: string) => void
  reconcileBookmarks: (bookmarks: Record<number, BookmarkItem[]>) => void
  getMergedChapterBookmarks: (
    chapterId: number,
    propsBookmarks: Record<number, BookmarkItem[]>
  ) => BookmarkListItem[]
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  pendingBookmarks: {},

  addPendingBookmark: (chapterId, item) => {
    const cid = Number(chapterId)
    set((s) => {
      const prev = s.pendingBookmarks[cid] || []
      const filtered = prev.filter((b) => b.id !== item.id)
      return {
        pendingBookmarks: {
          ...s.pendingBookmarks,
          [cid]: [...filtered, item]
        }
      }
    })
  },

  removePendingBookmark: (chapterId, id) => {
    const cid = Number(chapterId)
    set((s) => {
      const prev = s.pendingBookmarks[cid] || []
      const next = prev.filter((b) => b.id !== id)
      const pending = { ...s.pendingBookmarks }
      if (next.length) pending[cid] = next
      else delete pending[cid]
      return { pendingBookmarks: pending }
    })
  },

  reconcileBookmarks: (bookmarks) => {
    set((s) => {
      const nextPending = { ...s.pendingBookmarks }
      Object.keys(nextPending).forEach((key) => {
        const cid = Number(key)
        const propsList = bookmarks[cid] || []
        const propsIds = new Set(propsList.map((b) => b.id))
        const filtered = (nextPending[cid] || []).filter((p) => !propsIds.has(p.id))
        if (filtered.length) nextPending[cid] = filtered
        else delete nextPending[cid]
      })
      return { pendingBookmarks: nextPending }
    })
  },

  getMergedChapterBookmarks: (chapterId, propsBookmarks) => {
    const cid = Number(chapterId)
    const propsList = (propsBookmarks[cid] || []).map((item) => normalizeBookmarkItem(item, cid))
    const pending = get().pendingBookmarks[cid] || []
    const propsIds = new Set(propsList.map((b) => b.id))
    const pendingOnly = pending.filter((p) => !propsIds.has(p.id))
    return mergeBookmarkItems([...propsList, ...pendingOnly], propsList)
  }
}))
