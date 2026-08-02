import type { LineItem } from '@react-epub-reader/reader'
import { USE_MOCK } from './index'
import { apiPost, apiGet } from './request-helper'
import { consumeMockLineFailure } from './debug-config'
import {
  mockDeleteLine,
  mockEditLine,
  mockFetchLineList,
  mockSaveLine
} from './mock-store'

export async function saveLine(bookId: number, payload: LineItem): Promise<LineItem> {
  if (USE_MOCK) {
    if (consumeMockLineFailure()) {
      throw new Error('mock line save failed')
    }
    return mockSaveLine(bookId, payload)
  }
  const res = await apiPost<{ code?: number; body?: LineItem }>('/read/line/save', {
    bookId,
    chapterId: payload.chapterId,
    webLineId: payload.webLineId,
    summary: JSON.stringify({
      posInfo: payload.posInfo,
      underlineColor: payload.underlineColor
    })
  })
  if (Number(res.code) !== 0 || !res.body) {
    throw new Error('saveLine failed')
  }
  return { ...payload, ...res.body, id: res.body.id ?? null }
}

export async function editLine(bookId: number, payload: LineItem): Promise<LineItem> {
  if (USE_MOCK) {
    return mockEditLine(bookId, payload)
  }
  const res = await apiPost<{ code?: number; body?: LineItem }>('/read/line/edit', {
    bookId,
    chapterId: payload.chapterId,
    webLineId: payload.webLineId,
    summary: JSON.stringify({
      posInfo: payload.posInfo,
      underlineColor: payload.underlineColor
    })
  })
  if (Number(res.code) !== 0 || !res.body) {
    throw new Error('editLine failed')
  }
  return { ...payload, ...res.body }
}

export async function fetchLineList(bookId: number): Promise<Record<number, Record<string, LineItem>>> {
  if (USE_MOCK) {
    return mockFetchLineList(bookId)
  }
  const res = await apiGet<{ code?: number; body?: Record<number, Record<string, LineItem>> }>(
    '/read/line/list',
    { bookId }
  )
  return res.body || {}
}

export async function deleteLine(bookId: number, webLineId: string): Promise<void> {
  if (USE_MOCK) {
    mockDeleteLine(bookId, webLineId)
    return
  }
  const res = await apiPost<{ code?: number }>('/read/line/del', { bookId, webLineId })
  if (Number(res.code) !== 0) {
    throw new Error('deleteLine failed')
  }
}
