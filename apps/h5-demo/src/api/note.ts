import type { NoteItem } from '@react-epub-reader/reader'
import { USE_MOCK } from './index'
import { apiPost, apiGet } from './request-helper'
import { consumeMockNoteFailure } from './debug-config'
import { mockDeleteNote, mockFetchNoteList, mockSaveNote } from './mock-store'

export async function saveNote(bookId: number, payload: NoteItem): Promise<NoteItem> {
  if (USE_MOCK) {
    if (consumeMockNoteFailure()) {
      throw new Error('mock note save failed')
    }
    return mockSaveNote(bookId, payload)
  }
  const res = await apiPost<{ code?: number; body?: NoteItem }>('/read/note/save', {
    bookId,
    chapterId: payload.chapterId,
    webNoteId: payload.webNoteId,
    summary: JSON.stringify({ posInfo: payload.posInfo, content: payload.content })
  })
  if (Number(res.code) !== 0 || !res.body) {
    throw new Error('saveNote failed')
  }
  return { ...payload, ...res.body, id: res.body.id ?? null }
}

export async function fetchNoteList(bookId: number): Promise<Record<number, Record<string, NoteItem>>> {
  if (USE_MOCK) {
    return mockFetchNoteList(bookId)
  }
  const res = await apiGet<{ code?: number; body?: Record<number, Record<string, NoteItem>> }>(
    '/read/note/list',
    { bookId }
  )
  return res.body || {}
}

export async function deleteNote(bookId: number, webNoteId: string): Promise<void> {
  if (USE_MOCK) {
    mockDeleteNote(bookId, webNoteId)
    return
  }
  const res = await apiPost<{ code?: number }>('/read/note/del', { bookId, webNoteId })
  if (Number(res.code) !== 0) {
    throw new Error('deleteNote failed')
  }
}
