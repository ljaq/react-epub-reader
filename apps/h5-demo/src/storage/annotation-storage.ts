import type { BookmarkItem, LineItem, NoteItem } from '@react-epub-reader/reader'

const STORAGE_PREFIX = 'h5-demo-annotations:v1:'

export interface PersistedAnnotations {
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  bookmarks: Record<number, BookmarkItem[]>
  nextLineId: number
  nextNoteId: number
}

export type AnnotationScope =
  | `book:${number}`
  | 'epub:sample'
  | `epub:file:${string}`

export interface ResolveScopeInput {
  mode: 'h5-component' | 'webview-api' | 'webview-epub'
  bookId?: number
  epubSource?: 'sample' | { fileName: string }
}

const DEFAULT_ANNOTATIONS: PersistedAnnotations = {
  lines: {},
  notes: {},
  bookmarks: {},
  nextLineId: 1000,
  nextNoteId: 2000,
}

function storageKey(scope: AnnotationScope): string {
  return `${STORAGE_PREFIX}${scope}`
}

function cloneAnnotations(data: PersistedAnnotations): PersistedAnnotations {
  return {
    lines: structuredClone(data.lines),
    notes: structuredClone(data.notes),
    bookmarks: structuredClone(data.bookmarks),
    nextLineId: data.nextLineId,
    nextNoteId: data.nextNoteId,
  }
}

export function resolveScope(input: ResolveScopeInput): AnnotationScope {
  if (input.mode === 'webview-epub') {
    if (input.epubSource === 'sample') return 'epub:sample'
    if (input.epubSource && typeof input.epubSource === 'object') {
      return `epub:file:${input.epubSource.fileName}`
    }
    return 'epub:sample'
  }

  const bookId = input.bookId ?? 12535542
  return `book:${bookId}`
}

export function loadAnnotations(scope: AnnotationScope): PersistedAnnotations {
  if (typeof localStorage === 'undefined') {
    return cloneAnnotations(DEFAULT_ANNOTATIONS)
  }

  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return cloneAnnotations(DEFAULT_ANNOTATIONS)

    const parsed = JSON.parse(raw) as Partial<PersistedAnnotations>
    return {
      lines: parsed.lines ?? {},
      notes: parsed.notes ?? {},
      bookmarks: parsed.bookmarks ?? {},
      nextLineId: parsed.nextLineId ?? DEFAULT_ANNOTATIONS.nextLineId,
      nextNoteId: parsed.nextNoteId ?? DEFAULT_ANNOTATIONS.nextNoteId,
    }
  } catch {
    return cloneAnnotations(DEFAULT_ANNOTATIONS)
  }
}

export function saveAnnotations(scope: AnnotationScope, data: PersistedAnnotations): void {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(data))
  } catch {
    // quota exceeded or private mode — ignore
  }
}

function withStore(
  scope: AnnotationScope,
  updater: (store: PersistedAnnotations) => PersistedAnnotations,
): PersistedAnnotations {
  const current = loadAnnotations(scope)
  const next = updater(current)
  saveAnnotations(scope, next)
  return next
}

export function saveLine(scope: AnnotationScope, payload: LineItem): LineItem {
  withStore(scope, (store) => {
    const item: LineItem = {
      ...payload,
      id: payload.id ?? store.nextLineId,
      time: payload.time ?? '刚刚',
    }
    const cid = payload.chapterId
    if (!store.lines[cid]) store.lines[cid] = {}
    store.lines[cid][payload.webLineId] = item
    if (!payload.id) store.nextLineId += 1
    return store
  })

  const bucket = loadAnnotations(scope).lines[payload.chapterId]
  return bucket[payload.webLineId]
}

export function editLine(scope: AnnotationScope, payload: LineItem): LineItem {
  withStore(scope, (store) => {
    const cid = payload.chapterId
    const existing = store.lines[cid]?.[payload.webLineId]
    const item: LineItem = { ...existing, ...payload, time: existing?.time || '刚刚' }
    if (!store.lines[cid]) store.lines[cid] = {}
    store.lines[cid][payload.webLineId] = item
    return store
  })

  return loadAnnotations(scope).lines[payload.chapterId][payload.webLineId]
}

export function deleteLine(scope: AnnotationScope, webLineId: string): void {
  withStore(scope, (store) => {
    Object.keys(store.lines).forEach((key) => {
      const cid = Number(key)
      if (store.lines[cid]?.[webLineId]) {
        delete store.lines[cid][webLineId]
      }
    })
    return store
  })
}

export function saveNote(scope: AnnotationScope, payload: NoteItem): NoteItem {
  withStore(scope, (store) => {
    const item: NoteItem = {
      ...payload,
      id: payload.id ?? store.nextNoteId,
      time: payload.time ?? '刚刚',
    }
    const cid = payload.chapterId
    if (!store.notes[cid]) store.notes[cid] = {}
    store.notes[cid][payload.webNoteId] = item
    if (!payload.id) store.nextNoteId += 1
    return store
  })

  return loadAnnotations(scope).notes[payload.chapterId][payload.webNoteId]
}

export function deleteNote(scope: AnnotationScope, webNoteId: string): void {
  withStore(scope, (store) => {
    Object.keys(store.notes).forEach((key) => {
      const cid = Number(key)
      if (store.notes[cid]?.[webNoteId]) {
        delete store.notes[cid][webNoteId]
      }
    })
    return store
  })
}

export function saveBookmark(scope: AnnotationScope, payload: BookmarkItem): BookmarkItem {
  withStore(scope, (store) => {
    const cid = payload.chapterId
    const list = [...(store.bookmarks[cid] || [])]
    const idx = list.findIndex((b) => b.id === payload.id)
    const item = { ...payload, time: payload.time ?? '刚刚' }
    if (idx >= 0) list[idx] = item
    else list.push(item)
    store.bookmarks[cid] = list
    return store
  })

  const list = loadAnnotations(scope).bookmarks[payload.chapterId] || []
  return list.find((b) => b.id === payload.id) ?? payload
}

export function deleteBookmark(scope: AnnotationScope, chapterId: number, id: string): void {
  withStore(scope, (store) => {
    store.bookmarks[chapterId] = (store.bookmarks[chapterId] || []).filter((b) => b.id !== id)
    return store
  })
}

export function clearAnnotations(scope: AnnotationScope): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(storageKey(scope))
}
