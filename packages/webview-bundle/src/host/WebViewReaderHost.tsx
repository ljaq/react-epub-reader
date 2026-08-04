import { useCallback, useMemo } from 'react'
import {
  Reader,
  type BookmarkItem,
  type LineItem,
  type NoteItem,
  type ReadingSnapshot,
} from '@react-epub-reader/reader'
import { emit } from '../bridge/dispatch'
import { OUTBOUND_TYPES } from '../bridge/protocol'
import { fetchChapterContent, type CommandContext } from './command-handler'
import { createThoughtsMenuSlot } from '../slots/thoughts-menu'
import { ReaderBootLoading } from '../components/ReaderBootLoading'
import type { WebViewHostState } from './webview-host-store'

export interface WebViewReaderHostProps {
  state: WebViewHostState
  commandCtx: CommandContext
}

export function WebViewReaderHost({ state, commandCtx }: WebViewReaderHostProps) {
  const handleNavigate = useCallback((path: string) => {
    emit(OUTBOUND_TYPES.navigate, { path })
  }, [])

  const chromeSlots = useMemo(
    () => createThoughtsMenuSlot(handleNavigate),
    [handleNavigate],
  )

  const onChapterChange = useCallback(
    (chapterId: number, width: number) => {
      emit(OUTBOUND_TYPES.chapterChange, { chapterId, width })
      if (commandCtx.getState().dataSource === 'epub') {
        void fetchChapterContent(commandCtx, chapterId)
      }
    },
    [commandCtx],
  )

  const onPrefetch = useCallback(
    (ids: number[], width: number) => {
      emit(OUTBOUND_TYPES.prefetch, { chapterIds: ids, width })
      if (commandCtx.getState().dataSource === 'epub') {
        ids.forEach((id) => void fetchChapterContent(commandCtx, id))
      }
    },
    [commandCtx],
  )

  const onLineCreate = useCallback((payload: LineItem) => {
    emit(OUTBOUND_TYPES.lineCreate, payload)
  }, [])

  const onLineUpdate = useCallback((payload: LineItem) => {
    emit(OUTBOUND_TYPES.lineUpdate, payload)
  }, [])

  const onLineDelete = useCallback((payload: { bookId: number; webLineId: string }) => {
    emit(OUTBOUND_TYPES.lineDelete, payload)
  }, [])

  const onNoteCreate = useCallback((payload: NoteItem) => {
    emit(OUTBOUND_TYPES.noteCreate, payload)
  }, [])

  const onNoteDelete = useCallback((payload: { bookId: number; webNoteId: string }) => {
    emit(OUTBOUND_TYPES.noteDelete, payload)
  }, [])

  const onBookmarkCreate = useCallback((payload: BookmarkItem) => {
    emit(OUTBOUND_TYPES.bookmarkCreate, payload)
  }, [])

  const onBookmarkDelete = useCallback(
    (payload: { bookId: number; chapterId: number; id: string }) => {
      emit(OUTBOUND_TYPES.bookmarkDelete, payload)
    },
    [],
  )

  const onReadingPositionChange = useCallback((snapshot: ReadingSnapshot) => {
    emit(OUTBOUND_TYPES.readingPositionChange, snapshot)
  }, [])

  const onTtsAudioRequest = useCallback(
    (req: { reqId: string; text: string; voiceType: string; chapterId: number }) => {
      emit(OUTBOUND_TYPES.ttsAudioRequest, req)
    },
    [],
  )

  const onTtsReadTimeReport = useCallback(
    (payload: { bookId: number; chapterId: number; seconds: number }) => {
      emit(OUTBOUND_TYPES.ttsReadTimeReport, payload)
    },
    [],
  )

  const onLinkClick = useCallback((href: string) => {
    emit(OUTBOUND_TYPES.linkClick, { href })
  }, [])

  const onBookDetailClick = useCallback((bookId: number) => {
    emit(OUTBOUND_TYPES.bookDetailClick, { bookId })
  }, [])

  const onBookshelfAdd = useCallback((bookId: number) => {
    emit(OUTBOUND_TYPES.bookshelfAdd, { bookId })
  }, [])

  const onLoginRequired = useCallback((reason: 'paid' | 'trial_end' | 'auth') => {
    emit(OUTBOUND_TYPES.loginRequired, { reason })
  }, [])

  const onReady = useCallback(() => {
    emit(OUTBOUND_TYPES.ready, { bookId: state.bookId })
  }, [state.bookId])

  const onError = useCallback((payload: { scope: string; message: string }) => {
    emit(OUTBOUND_TYPES.error, payload)
  }, [])

  const onAnnotationError = useCallback(
    (payload: { clientId: string; type: 'line' | 'note' | 'bookmark'; error: unknown }) => {
      emit(OUTBOUND_TYPES.annotationError, payload)
    },
    [],
  )

  if (state.loading || !state.ready) {
    return <ReaderBootLoading />
  }

  if (state.bootstrapError) {
    const label = state.dataSource === 'epub' ? 'EPUB' : '书籍'
    return (
      <div style={{ padding: 24 }}>
        <p>{label}加载失败：{state.bootstrapError}</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <Reader
        bookId={state.bookId}
        initialChapterId={state.initialChapterId}
        initialPosition={state.initialPosition}
        chapterList={state.chapterList}
        chapters={state.chapters}
        chapterAccess={state.chapterAccess}
        chapterLoadStates={state.chapterLoadStates}
        lines={state.lines}
        notes={state.notes}
        bookmarks={state.bookmarks}
        bookMeta={state.bookMeta}
        user={state.user}
        ttsVoiceTypes={state.ttsVoiceTypes}
        ttsAudioUrl={state.ttsAudioUrl}
        annotationFailure={state.annotationFailure}
        chromeSlots={chromeSlots}
        navigate={handleNavigate}
        onChapterChange={onChapterChange}
        onPrefetch={onPrefetch}
        onLineCreate={onLineCreate}
        onLineUpdate={onLineUpdate}
        onLineDelete={onLineDelete}
        onNoteCreate={onNoteCreate}
        onNoteDelete={onNoteDelete}
        onBookmarkCreate={onBookmarkCreate}
        onBookmarkDelete={onBookmarkDelete}
        onAnnotationError={onAnnotationError}
        onReadingPositionChange={onReadingPositionChange}
        onTtsAudioRequest={onTtsAudioRequest}
        onTtsReadTimeReport={onTtsReadTimeReport}
        onLinkClick={onLinkClick}
        onBookDetailClick={onBookDetailClick}
        onBookshelfAdd={onBookshelfAdd}
        onLoginRequired={onLoginRequired}
        onReady={onReady}
        onError={onError}
      />
    </div>
  )
}
