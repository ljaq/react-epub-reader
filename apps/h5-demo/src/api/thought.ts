import { USE_MOCK } from './index'
import { apiPost, apiGet } from './request-helper'
import {
  mockCancelThoughtLike,
  mockFetchThoughtList,
  mockLikeThought,
  mockSaveThought,
  type MockThoughtItem
} from './mock-store'

export type { MockThoughtItem as ThoughtItem }

export interface ThoughtListPager {
  hasNext: number
  nextRowId: number
}

export interface ThoughtListResponse {
  lists: MockThoughtItem[]
  pager: ThoughtListPager
}

export async function fetchThoughtList(
  bookId: number,
  nextRowId?: number
): Promise<ThoughtListResponse> {
  if (USE_MOCK) {
    return mockFetchThoughtList(bookId, nextRowId)
  }
  const params: Record<string, unknown> = { bookId }
  if (nextRowId != null && nextRowId > 0) {
    params.nextRowId = nextRowId
  }
  const res = await apiGet<{ code?: number; body?: ThoughtListResponse }>(
    '/topic/list/more',
    params
  )
  return res.body || { lists: [], pager: { hasNext: 0, nextRowId: -1 } }
}

export async function likeThought(bookId: number, thoughtId: number): Promise<void> {
  if (USE_MOCK) {
    mockLikeThought(bookId, thoughtId)
    return
  }
  await apiPost('/api/topic/like', { bookId, topicId: thoughtId })
}

export async function cancelThoughtLike(bookId: number, thoughtId: number): Promise<void> {
  if (USE_MOCK) {
    mockCancelThoughtLike(bookId, thoughtId)
    return
  }
  await apiPost('/api/topic/canclelike', { bookId, topicId: thoughtId })
}

export async function saveThought(bookId: number, content: string): Promise<MockThoughtItem> {
  if (USE_MOCK) {
    return mockSaveThought(bookId, content)
  }
  const res = await apiPost<{ code?: number; body?: MockThoughtItem }>('/topic/add', {
    bookId,
    content
  })
  if (Number(res.code) !== 0 || !res.body) {
    throw new Error('saveThought failed')
  }
  return res.body
}
