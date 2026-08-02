import { USE_MOCK } from './index'
import { apiGet } from './request-helper'
import { parseCheckReadAccess, parseNextChapterAccess } from './chapter-access'
import type { BookMeta, ChapterContent, ChapterMeta } from '@react-epub-reader/reader'
import {
  mockFetchBookMeta,
  mockFetchChapterList,
  mockFetchCheckRead,
  mockGetChapterContent
} from './mock-store'

export interface ChapterContentResponse {
  code?: number
  chapterName?: string
  html?: string
  hasNext?: boolean
  pageButton?: string
  body?: {
    chapterName?: string
    html?: string
    hasNext?: boolean
    pageButton?: string
  }
}

export async function fetchChapterList(bookId: number): Promise<ChapterMeta[]> {
  if (USE_MOCK) {
    return mockFetchChapterList(bookId)
  }
  const res = await apiGet<{ code?: number; body?: ChapterMeta[] }>('/chapter', { bookId })
  const list = res.body || []
  return list.map((item, index) => ({ ...item, index }))
}

export async function fetchChapterContent(
  bookId: number,
  chapterId: number,
  width: number
): Promise<{ content: ChapterContent | null; access: ReturnType<typeof parseNextChapterAccess> }> {
  if (USE_MOCK) {
    const content = mockGetChapterContent(bookId, chapterId, width)
    return { content, access: { ok: true, needLogin: false, needPurchase: false } }
  }

  const res = await apiGet<ChapterContentResponse>('/nextchapter', {
    bookId,
    chapterId,
    width: width || 398
  })
  const access = parseNextChapterAccess(res)
  if (!access.ok) {
    return { content: null, access }
  }
  const body = res.body || res
  const content: ChapterContent = {
    chapterId,
    chapterName: body.chapterName || res.chapterName || '',
    html: body.html || res.html || '',
    hasNext: Boolean(body.hasNext ?? res.hasNext),
    pageButton: body.pageButton || res.pageButton || ''
  }
  return { content, access }
}

export async function fetchBookMeta(bookId: number): Promise<BookMeta> {
  if (USE_MOCK) {
    return mockFetchBookMeta(bookId)
  }
  const res = await apiGet<{ code?: number; body?: BookMeta }>('/read', { bookId })
  return res.body || { bookId, bookName: '', author: '', bookPic: '' }
}

export async function fetchCheckRead(bookId: number, chapterId: number) {
  if (USE_MOCK) {
    return parseCheckReadAccess(mockFetchCheckRead(bookId, chapterId))
  }
  const res = await apiGet('/checkread', { bookId, chapterId })
  return parseCheckReadAccess(res)
}
