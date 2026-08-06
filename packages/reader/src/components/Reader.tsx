/**
 * Reader 根组件 — Props 驱动渲染、回调输出。
 *
 * Phase 5：NotesPopup / ReadLoginTip / 进度上报 / initialPosition / bookmark reconcile。
 */
import { useEffect, useRef } from 'react'
import type { ReaderProps } from '../types/props'
import { ReaderContent } from './content/ReaderContent'
import { ReaderChrome } from './chrome/ReaderChrome'
import { CatalogPopup } from './popups/CatalogPopup/CatalogPopup'
import { NotesPopup } from './popups/NotesPopup/NotesPopup'
import { ReadLoginTip } from './overlays/ReadLoginTip/ReadLoginTip'
import { ImagePreviewOverlay } from './overlays/ImagePreviewOverlay/ImagePreviewOverlay'
import { FootnotePopover } from './overlays/FootnotePopover/FootnotePopover'
import { ReaderToast } from './overlays/Toast'
import { TtsLayer } from './popups/tts/TtsLayer'
import type { SelectionBridgeHandle } from './overlays/selection/SelectionLayer'
import { useAnnotationStore } from '../store/annotation-store'
import { useBookmarkStore } from '../store/bookmark-store'
import { useUiStore } from '../store/ui-store'
import { useNavigateToNavTarget, useInitialPositionRestore } from '../hooks/useNavigateToNavTarget'
import { useReadingPositionReporter } from '../hooks/useReadingPositionReporter'
import { useContentStyles } from '../hooks/useContentStyles'

export function Reader(props: ReaderProps): React.ReactNode {
  const {
    bookId,
    chapterList,
    chapters,
    chapterAccess,
    chapterLoadStates,
    lines,
    notes,
    bookmarks,
    initialChapterId,
    initialPosition,
    bookMeta,
    user,
    ttsVoiceTypes,
    ttsAudioUrl,
    chromeSlots,
    onChapterChange,
    onPrefetch,
    onLoginRequired,
    onBookDetailClick,
    onBookshelfAdd,
    onBookmarkCreate,
    onBookmarkDelete,
    onLineCreate,
    onLineUpdate,
    onLineDelete,
    onNoteCreate,
    onNoteDelete,
    onAnnotationError,
    onReadingPositionChange,
    onTtsAudioRequest,
  onTtsReadTimeReport,
  onReady,
  onError,
  onLinkClick,
  annotationFailure
  } = props

  const initialPositionConsumedRef = useRef(false)
  const reconcileLines = useAnnotationStore((s) => s.reconcileLines)
  const reconcileNotes = useAnnotationStore((s) => s.reconcileNotes)
  const reconcileBookmarks = useBookmarkStore((s) => s.reconcileBookmarks)
  const hideReadLoginTip = useUiStore((s) => s.hideReadLoginTip)
  const readTip = useUiStore((s) => s.readTip)
  const showToast = useUiStore((s) => s.showToast)
  const removePendingBookmark = useBookmarkStore((s) => s.removePendingBookmark)
  const annotationFailureRef = useRef<number>(0)
  const selectionBridgeRef = useRef<SelectionBridgeHandle | null>(null)
  const { rootStyle: themeStyle } = useContentStyles()

  useNavigateToNavTarget()
  useInitialPositionRestore({ initialPosition, consumedRef: initialPositionConsumedRef })

  useReadingPositionReporter({
    bookId,
    chapterList,
    isLoggedIn: user.isLoggedIn,
    onReadingPositionChange
  })

  useEffect(() => {
    onReady?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    reconcileLines(lines)
  }, [lines, reconcileLines])

  useEffect(() => {
    reconcileNotes(notes)
  }, [notes, reconcileNotes])

  useEffect(() => {
    reconcileBookmarks(bookmarks)
  }, [bookmarks, reconcileBookmarks])

  useEffect(() => {
    if (user.isLoggedIn) {
      hideReadLoginTip()
    }
  }, [user.isLoggedIn, hideReadLoginTip])

  useEffect(() => {
    if (!annotationFailure) return
    if (annotationFailure.nonce === annotationFailureRef.current) return
    annotationFailureRef.current = annotationFailure.nonce
    const { clientId, type, chapterId } = annotationFailure
    const bridge = selectionBridgeRef.current

    if (type === 'line') {
      bridge?.rollbackSaveLine(chapterId, clientId)
    } else if (type === 'note') {
      bridge?.rollbackSaveNote(chapterId, clientId)
    } else if (type === 'bookmark') {
      removePendingBookmark(chapterId, clientId)
      showToast('添加失败，请重试')
      onAnnotationError?.({ clientId, type: 'bookmark', error: new Error('save bookmark failed') })
    }
  }, [annotationFailure, removePendingBookmark, showToast, onAnnotationError])

  const navigate = props.navigate

  const handleOverlayBack = () => {
    hideReadLoginTip()
    if (typeof window !== 'undefined' && window.history) {
      window.history.back()
    }
  }

  return (
    <div
      data-reader-root
      style={{ width: '100%', height: '100%', ...themeStyle }}
    >
      <ReaderContent
        bookId={bookId}
        chapterList={chapterList}
        chapters={chapters}
        chapterAccess={chapterAccess}
        chapterLoadStates={chapterLoadStates}
        lines={lines}
        notes={notes}
        bookmarks={bookmarks}
        initialChapterId={initialChapterId}
        isLoggedIn={user.isLoggedIn}
        paidChapterStart={bookMeta.paidChapterStart}
        selectionBridgeRef={selectionBridgeRef}
        onChapterChange={onChapterChange}
        onPrefetch={onPrefetch}
        onLoginRequired={onLoginRequired}
        onError={onError}
        onLineCreate={onLineCreate}
        onLineUpdate={onLineUpdate}
        onLineDelete={onLineDelete}
        onNoteCreate={onNoteCreate}
        onNoteDelete={onNoteDelete}
        onAnnotationError={onAnnotationError}
        bookMeta={bookMeta}
        onLinkClick={onLinkClick}
      />

      <ReaderChrome
        bookId={bookId}
        chapterList={chapterList}
        chapterAccess={chapterAccess}
        bookmarks={bookmarks}
        bookMeta={bookMeta}
        isLoggedIn={user.isLoggedIn}
        inBookshelf={user.inBookshelf}
        chromeSlots={chromeSlots}
        navigate={navigate}
        onLoginRequired={onLoginRequired}
        onBookshelfAdd={onBookshelfAdd}
        onBookmarkCreate={onBookmarkCreate}
        onBookmarkDelete={onBookmarkDelete}
      />

      <CatalogPopup
        bookId={bookId}
        bookMeta={bookMeta}
        chapterList={chapterList}
        chapterAccess={chapterAccess}
        isLoggedIn={user.isLoggedIn}
        onBookDetailClick={onBookDetailClick}
        onLoginRequired={onLoginRequired}
      />

      <NotesPopup
        bookId={bookId}
        chapterList={chapterList}
        lines={lines}
        notes={notes}
        bookmarks={bookmarks}
        onNoteDelete={onNoteDelete}
        onBookmarkDelete={onBookmarkDelete}
      />

      <ReadLoginTip
        variant="overlay"
        visible={Boolean(readTip.showOverlay && !user.isLoggedIn)}
        onLoginRequired={onLoginRequired}
        onBack={handleOverlayBack}
      />

      <ImagePreviewOverlay />
      <FootnotePopover />

      <ReaderToast />

      <TtsLayer
        bookId={bookId}
        bookMeta={bookMeta}
        chapterList={chapterList}
        chapters={chapters}
        ttsVoiceTypes={ttsVoiceTypes}
        ttsAudioUrl={ttsAudioUrl}
        isLoggedIn={user.isLoggedIn}
        onTtsAudioRequest={onTtsAudioRequest}
        onTtsReadTimeReport={onTtsReadTimeReport}
      />
    </div>
  )
}
