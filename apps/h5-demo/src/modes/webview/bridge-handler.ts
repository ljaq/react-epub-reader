import type { BookmarkItem, LineItem, NoteItem } from '@react-epub-reader/reader'
import {
  INBOUND_TYPES,
  OUTBOUND_TYPES,
  parseMessage,
  type BridgeMessage,
} from '@react-epub-reader/webview-bundle'
import {
  deleteLine as apiDeleteLine,
  editLine as apiEditLine,
  saveLine as apiSaveLine,
  saveNote as apiSaveNote,
  deleteNote as apiDeleteNote,
  saveBookmark as apiSaveBookmark,
  deleteBookmark as apiDeleteBookmark,
  fetchTtsAudio,
} from '../../api'
import {
  deleteBookmark as storageDeleteBookmark,
  deleteLine as storageDeleteLine,
  deleteNote as storageDeleteNote,
  editLine as storageEditLine,
  saveBookmark as storageSaveBookmark,
  saveLine as storageSaveLine,
  saveNote as storageSaveNote,
  type AnnotationScope,
} from '../../storage/annotation-storage'
import { injectChapterIfNeeded } from './api-bootstrap'
import { dispatchStoredAnnotations, withClientId } from './epub-bootstrap'

export interface BridgeHandlerContext {
  dataSource: 'api' | 'epub'
  bookId: number
  scope: AnnotationScope
  dispatch: (type: string, payload?: unknown) => void
  onNavigate?: (path: string) => void
}

const injectedChapters = new Set<string>()

function chapterKey(bookId: number, chapterId: number): string {
  return `${bookId}:${chapterId}`
}

export function resetBridgeChapterCache(): void {
  injectedChapters.clear()
}

export function seedInjectedChapters(bookId: number, chapterIds: number[]): void {
  chapterIds.forEach((chapterId) => {
    injectedChapters.add(chapterKey(bookId, chapterId))
  })
}

export function handleBridgeMessage(raw: string, ctx: BridgeHandlerContext): void {
  const msg = parseMessage(raw)
  if (!msg) return

  void handleMessage(msg, ctx)
}

async function handleMessage(msg: BridgeMessage, ctx: BridgeHandlerContext): Promise<void> {
  const { type, payload } = msg

  switch (type) {
    case OUTBOUND_TYPES.chapterChange: {
      if (ctx.dataSource !== 'api') return
      const { chapterId, width } = payload as { chapterId: number; width: number }
      const key = chapterKey(ctx.bookId, chapterId)
      if (injectedChapters.has(key)) return
      injectedChapters.add(key)
      await injectChapterIfNeeded(ctx.bookId, chapterId, width, ctx.dispatch)
      break
    }

    case OUTBOUND_TYPES.prefetch: {
      if (ctx.dataSource !== 'api') return
      const { chapterIds, width } = payload as { chapterIds: number[]; width: number }
      await Promise.all(
        chapterIds.map(async (chapterId) => {
          const key = chapterKey(ctx.bookId, chapterId)
          if (injectedChapters.has(key)) return
          injectedChapters.add(key)
          await injectChapterIfNeeded(ctx.bookId, chapterId, width, ctx.dispatch)
        }),
      )
      break
    }

    case OUTBOUND_TYPES.lineCreate:
      await handleLineCreate(payload as LineItem, ctx)
      break

    case OUTBOUND_TYPES.lineUpdate:
      await handleLineUpdate(payload as LineItem, ctx)
      break

    case OUTBOUND_TYPES.lineDelete:
      await handleLineDelete(payload as { bookId: number; webLineId: string }, ctx)
      break

    case OUTBOUND_TYPES.noteCreate:
      await handleNoteCreate(payload as NoteItem, ctx)
      break

    case OUTBOUND_TYPES.noteDelete:
      await handleNoteDelete(payload as { bookId: number; webNoteId: string }, ctx)
      break

    case OUTBOUND_TYPES.bookmarkCreate:
      await handleBookmarkCreate(payload as BookmarkItem, ctx)
      break

    case OUTBOUND_TYPES.bookmarkDelete:
      await handleBookmarkDelete(
        payload as { bookId: number; chapterId: number; id: string },
        ctx,
      )
      break

    case OUTBOUND_TYPES.ttsAudioRequest: {
      const req = payload as {
        reqId: string
        text: string
        voiceType: string
        chapterId: number
      }
      const entry = await fetchTtsAudio(ctx.bookId, req)
      ctx.dispatch(INBOUND_TYPES.injectTtsAudio, entry)
      break
    }

    case OUTBOUND_TYPES.navigate: {
      const { path } = payload as { path: string }
      ctx.onNavigate?.(path)
      break
    }

    case OUTBOUND_TYPES.epubLoaded: {
      if (ctx.dataSource === 'epub') {
        dispatchStoredAnnotations(ctx.scope, ctx.dispatch)
      }
      break
    }

    default:
      break
  }
}

async function handleLineCreate(payload: LineItem, ctx: BridgeHandlerContext): Promise<void> {
  const clientId = payload.clientId || payload.webLineId
  try {
    const saved =
      ctx.dataSource === 'api'
        ? await apiSaveLine(ctx.bookId, payload)
        : storageSaveLine(ctx.scope, payload)

    ctx.dispatch(INBOUND_TYPES.updateLines, {
      chapterId: payload.chapterId,
      merge: true,
      lines: [withClientId(saved)],
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] lineCreate failed', error)
    ctx.dispatch(INBOUND_TYPES.signalAnnotationFailure, {
      clientId,
      type: 'line',
      chapterId: payload.chapterId,
    })
  }
}

async function handleLineUpdate(payload: LineItem, ctx: BridgeHandlerContext): Promise<void> {
  const clientId = payload.clientId || payload.webLineId
  try {
    const saved =
      ctx.dataSource === 'api'
        ? await apiEditLine(ctx.bookId, payload)
        : storageEditLine(ctx.scope, payload)

    ctx.dispatch(INBOUND_TYPES.updateLines, {
      chapterId: payload.chapterId,
      merge: true,
      lines: [withClientId(saved)],
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] lineUpdate failed', error)
    ctx.dispatch(INBOUND_TYPES.signalAnnotationFailure, {
      clientId,
      type: 'line',
      chapterId: payload.chapterId,
    })
  }
}

async function handleLineDelete(
  payload: { bookId: number; webLineId: string },
  ctx: BridgeHandlerContext,
): Promise<void> {
  if (ctx.dataSource === 'api') {
    await apiDeleteLine(ctx.bookId, payload.webLineId)
  } else {
    storageDeleteLine(ctx.scope, payload.webLineId)
  }
}

async function handleNoteCreate(payload: NoteItem, ctx: BridgeHandlerContext): Promise<void> {
  const clientId = payload.clientId || payload.webNoteId
  try {
    const saved =
      ctx.dataSource === 'api'
        ? await apiSaveNote(ctx.bookId, payload)
        : storageSaveNote(ctx.scope, payload)

    ctx.dispatch(INBOUND_TYPES.updateNotes, {
      chapterId: payload.chapterId,
      merge: true,
      notes: [withClientId(saved)],
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] noteCreate failed', error)
    ctx.dispatch(INBOUND_TYPES.signalAnnotationFailure, {
      clientId,
      type: 'note',
      chapterId: payload.chapterId,
    })
  }
}

async function handleNoteDelete(
  payload: { bookId: number; webNoteId: string },
  ctx: BridgeHandlerContext,
): Promise<void> {
  if (ctx.dataSource === 'api') {
    await apiDeleteNote(ctx.bookId, payload.webNoteId)
  } else {
    storageDeleteNote(ctx.scope, payload.webNoteId)
  }
}

async function handleBookmarkCreate(payload: BookmarkItem, ctx: BridgeHandlerContext): Promise<void> {
  const clientId = payload.id
  try {
    const saved =
      ctx.dataSource === 'api'
        ? await apiSaveBookmark(ctx.bookId, payload)
        : storageSaveBookmark(ctx.scope, payload)

    ctx.dispatch(INBOUND_TYPES.updateBookmarks, {
      chapterId: payload.chapterId,
      merge: true,
      bookmarks: [saved],
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[bridge] bookmarkCreate failed', error)
    ctx.dispatch(INBOUND_TYPES.signalAnnotationFailure, {
      clientId,
      type: 'bookmark',
      chapterId: payload.chapterId,
    })
  }
}

async function handleBookmarkDelete(
  payload: { bookId: number; chapterId: number; id: string },
  ctx: BridgeHandlerContext,
): Promise<void> {
  if (ctx.dataSource === 'api') {
    await apiDeleteBookmark(ctx.bookId, payload.chapterId, payload.id)
  } else {
    storageDeleteBookmark(ctx.scope, payload.chapterId, payload.id)
  }
}
