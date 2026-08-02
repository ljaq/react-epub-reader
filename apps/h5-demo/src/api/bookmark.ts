import type { BookmarkItem } from '@react-epub-reader/reader'
import { USE_MOCK } from './index'
import { apiPost, apiGet } from './request-helper'
import { consumeMockBookmarkFailure } from './debug-config'
import { mockDeleteBookmark, mockFetchBookmarks, mockSaveBookmark } from './mock-store'

export async function fetchBookmarks(bookId: number): Promise<Record<number, BookmarkItem[]>> {
  if (USE_MOCK) {
    return mockFetchBookmarks(bookId)
  }
  const res = await apiGet<{ code?: number; body?: Record<number, BookmarkItem[]> }>('/getbookmark', {
    bookId
  })
  return res.body || {}
}

export async function saveBookmark(bookId: number, payload: BookmarkItem): Promise<BookmarkItem> {
  if (USE_MOCK) {
    if (consumeMockBookmarkFailure()) {
      throw new Error('mock bookmark save failed')
    }
    return mockSaveBookmark(bookId, payload)
  }
  const res = await apiPost<{ code?: number; body?: BookmarkItem }>('/savebookmark', {
    bookId,
    chapterId: payload.chapterId,
    id: payload.id,
    domPos: payload.domPos,
    summary: payload.summary,
    precent: payload.precent,
    cur: payload.cur,
    totalPage: payload.totalPage,
    h5PageY: payload.h5PageY,
    strIdx: payload.strIdx
  })
  if (Number(res.code) !== 0) {
    throw new Error('saveBookmark failed')
  }
  return res.body || payload
}

export async function deleteBookmark(
  bookId: number,
  chapterId: number,
  id: string
): Promise<void> {
  if (USE_MOCK) {
    mockDeleteBookmark(bookId, chapterId, id)
    return
  }
  const res = await apiPost<{ code?: number }>('/deletebookmark', { bookId, chapterId, id })
  if (Number(res.code) !== 0) {
    throw new Error('deleteBookmark failed')
  }
}
