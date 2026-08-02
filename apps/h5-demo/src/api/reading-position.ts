import type { ReadingSnapshot } from '@react-epub-reader/reader'
import { USE_MOCK } from './index'
import { apiPost, apiGet } from './request-helper'
import { mockFetchReadPosition, mockSaveReadPosition } from './mock-store'

export async function saveReadPosition(bookId: number, snapshot: ReadingSnapshot): Promise<void> {
  if (USE_MOCK) {
    mockSaveReadPosition(bookId, snapshot)
    return
  }
  await apiPost('/read/position/save', {
    bookId,
    chapterId: snapshot.chapterId,
    domPos: snapshot.domPos,
    precent: snapshot.precent,
    pageIndex: snapshot.pageIndex
  })
}

export async function fetchReadPosition(bookId: number): Promise<ReadingSnapshot | null> {
  if (USE_MOCK) {
    return mockFetchReadPosition(bookId)
  }
  const res = await apiGet<{ code?: number; body?: ReadingSnapshot | null }>('/read/position/get', {
    bookId
  })
  if (Number(res.code) !== 0) return null
  return res.body ?? null
}
