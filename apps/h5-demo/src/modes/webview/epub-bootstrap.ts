import type { LoadEpubPayload } from '@react-epub-reader/webview-bundle'
import {
  loadAnnotations,
  resolveScope,
  type AnnotationScope,
} from '../../storage/annotation-storage'
import { INBOUND_TYPES } from '@react-epub-reader/webview-bundle'
import type { LineItem, NoteItem } from '@react-epub-reader/reader'

export const EPUB_BOOK_ID = 1

export interface EpubBootstrapOptions {
  sourceUrl: string
  scope: AnnotationScope
}

export function resolveEpubBootstrap(
  epubSource: 'sample' | { fileName: string },
): EpubBootstrapOptions {
  const scope = resolveScope({
    mode: 'webview-epub',
    epubSource: epubSource === 'sample' ? 'sample' : { fileName: epubSource.fileName },
  })

  return {
    scope,
    sourceUrl: epubSource === 'sample' ? `${window.location.origin}/sample.epub` : '',
  }
}

export function buildEpubLoadPayload(sourceUrl: string): LoadEpubPayload {
  return {
    bookId: EPUB_BOOK_ID,
    source: { kind: 'url', data: sourceUrl },
    ttsVoiceTypes: [
      { key: 'BV102_streaming', label: '儒雅青年' },
      { key: 'BV104_streaming', label: '温柔女声' },
    ],
  }
}

/** EPUB bootstrap 后 lines/notes 为空，需从 storage 回注 */
export function dispatchStoredAnnotations(
  scope: AnnotationScope,
  dispatch: (type: string, payload?: unknown) => void,
): void {
  const { lines, notes, bookmarks } = loadAnnotations(scope)

  Object.entries(lines).forEach(([chapterId, chapterLines]) => {
    const items = Object.values(chapterLines)
    if (items.length > 0) {
      dispatch(INBOUND_TYPES.updateLines, {
        chapterId: Number(chapterId),
        merge: true,
        lines: items,
      })
    }
  })

  Object.entries(notes).forEach(([chapterId, chapterNotes]) => {
    const items = Object.values(chapterNotes)
    if (items.length > 0) {
      dispatch(INBOUND_TYPES.updateNotes, {
        chapterId: Number(chapterId),
        merge: true,
        notes: items,
      })
    }
  })

  Object.entries(bookmarks).forEach(([chapterId, chapterBookmarks]) => {
    if (chapterBookmarks.length > 0) {
      dispatch(INBOUND_TYPES.updateBookmarks, {
        chapterId: Number(chapterId),
        merge: true,
        bookmarks: chapterBookmarks,
      })
    }
  })
}

export function withClientId(item: LineItem): LineItem & { clientId: string }
export function withClientId(item: NoteItem): NoteItem & { clientId: string }
export function withClientId(
  item: LineItem | NoteItem,
): (LineItem | NoteItem) & { clientId: string } {
  const clientId =
    'webLineId' in item
      ? item.clientId || item.webLineId
      : item.clientId || item.webNoteId
  return { ...item, clientId }
}
