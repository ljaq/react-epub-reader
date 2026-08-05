/**
 * 阅读引擎内容区分发 — 按 settings.flipMode 分发覆盖/平移/竖滚（phase-10）。
 *
 * - cover：PagedReader（掌阅级覆盖翻页，真分页页式结构）
 * - slide：HorizontalReader（整轨横滑，老用户默认，行为零改动）
 * - vertical：VerticalReader（上下滚动，行为零改动）
 * - simulation：仿真翻页预留（设置面板置灰不可选；persist 万一落入按 cover 渲染）
 *
 * horizontalEnabled 为 flipMode 派生字段（非竖滚即横排），下游消费方零改动。
 *
 * Phase 5：DOM 桥接 / 书签角标 / 竖滚 inline 试读提示 / atChapterEnd / 进度 scheduleReport。
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { BookmarkItem, LineItem, NoteItem, BookMeta } from '../../types'
import type {
  ChapterAccess,
  ChapterContent,
  ChapterLoadState,
  ChapterMeta
} from '../../types'
import { useChapterBuffer } from '../../hooks/useChapterBuffer'
import { useReadingStore } from '../../store/reading-store'
import { useSettingsStore } from '../../store/settings-store'
import { useUiStore } from '../../store/ui-store'
import { useReaderDomStore } from '../../store/reader-dom-store'
import { useBookmarkStore } from '../../store/bookmark-store'
import { BOOKMARK_ICON_URL, findBookmarkAtSnapshot } from '../../core/bookmark-match'
import { useTrialEndTip } from '../../hooks/useTrialEndTip'
import { computeReadingSnapshotFromDom } from '../../hooks/useReadingSnapshot'
import { scheduleReadingPositionReport } from '../../hooks/useReadingPositionReporter'
import { useBookCss } from '../../hooks/useBookCss'
import { resolveChapterFetchWidth } from '../../core/reader-viewport'
import {
  SelectionLayer,
  type SelectionBridgeHandle
} from '../overlays/selection/SelectionLayer'
import { WriteAnnotationPanel } from '../popups/WriteAnnotationPanel/WriteAnnotationPanel'
import { ReadLoginTip } from '../overlays/ReadLoginTip/ReadLoginTip'
import { HorizontalReader } from './HorizontalReader'
import { VerticalReader } from './VerticalReader'
import { PagedReader } from './paged/PagedReader'

export interface ReaderContentProps {
  bookId: number
  chapterList: ChapterMeta[]
  chapters: Record<number, ChapterContent>
  chapterAccess: Record<number, ChapterAccess>
  chapterLoadStates: Record<number, ChapterLoadState>
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  bookmarks: Record<number, BookmarkItem[]>
  initialChapterId?: number
  isLoggedIn: boolean
  paidChapterStart?: number
  selectionBridgeRef?: RefObject<SelectionBridgeHandle | null>
  getFetchWidth?: () => number
  onChapterChange?: (chapterId: number, width: number) => void
  onPrefetch?: (chapterIds: number[], width: number) => void
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
  onError?: (payload: { scope: string; message: string }) => void
  onLineCreate?: (payload: LineItem) => void
  onLineUpdate?: (payload: LineItem) => void
  onLineDelete?: (payload: { bookId: number; webLineId: string }) => void
  onNoteCreate?: (payload: NoteItem) => void
  onNoteDelete?: (payload: { bookId: number; webNoteId: string }) => void
  onAnnotationError?: (payload: {
    clientId: string
    type: 'line' | 'note' | 'bookmark'
    error: unknown
  }) => void
  bookMeta?: BookMeta
  onLinkClick?: (href: string) => void
}

export function ReaderContent(props: ReaderContentProps): React.ReactNode {
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
    isLoggedIn,
    paidChapterStart,
    selectionBridgeRef: externalSelectionBridgeRef,
    getFetchWidth: externalGetFetchWidth,
    onChapterChange,
    onPrefetch,
    onLoginRequired,
    onError,
    onLineCreate,
    onLineUpdate,
    onLineDelete,
    onNoteCreate,
    onNoteDelete,
    onAnnotationError,
    bookMeta,
    onLinkClick
  } = props

  const flipMode = useSettingsStore((s) => s.flipMode)
  const horizontalEnabled = useSettingsStore((s) => s.horizontalEnabled)
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageIndex = useReadingStore((s) => s.pageIndex)
  const pageCount = useReadingStore((s) => s.pageCount)
  const readTip = useUiStore((s) => s.readTip)
  const getMergedChapterBookmarks = useBookmarkStore((s) => s.getMergedChapterBookmarks)
  const updateReadingSnapshot = useReadingStore((s) => s.updateReadingSnapshot)

  const registerDomBody = useReaderDomStore((s) => s.registerBody)
  const registerDomScrollRoot = useReaderDomStore((s) => s.registerScrollRoot)
  const registerDomViewport = useReaderDomStore((s) => s.registerViewport)

  const internalSelectionBridgeRef = useRef<SelectionBridgeHandle | null>(null)
  const selectionBridgeRef = externalSelectionBridgeRef ?? internalSelectionBridgeRef
  const getViewportElFromStore = useReaderDomStore((s) => s.getViewportEl)
  const getScrollRootFromStore = useReaderDomStore((s) => s.getScrollRoot)

  const getFetchWidth = useCallback((): number => {
    if (externalGetFetchWidth) {
      const w = externalGetFetchWidth()
      if (w > 0) return w
    }
    return resolveChapterFetchWidth({
      viewportEl: getViewportElFromStore(),
      rootEl: getScrollRootFromStore()
    })
  }, [externalGetFetchWidth, getViewportElFromStore, getScrollRootFromStore])
  const bodyMapRef = useRef<Map<number, Element>>(new Map())
  const scrollRootRef = useRef<HTMLElement | null>(null)
  const viewportRef = useRef<HTMLElement | null>(null)
  const verticalBadgesRef = useRef<HTMLDivElement | null>(null)

  const { syncTrialEndTip } = useTrialEndTip({ isLoggedIn, paidChapterStart })

  useChapterBuffer({
    bookId,
    chapterList,
    chapters,
    chapterAccess,
    chapterLoadStates,
    initialChapterId,
    getFetchWidth,
    isLoggedIn,
    paidChapterStart,
    onChapterChange,
    onPrefetch,
    onLoginRequired,
    onError
  })

  const isChapterBlocked = useCallback(
    (id: number): boolean => {
      const acc = chapterAccess[Number(id)]
      return Boolean(acc && (acc.needLogin || acc.needPurchase))
    },
    [chapterAccess]
  )

  const getContentBodies = useCallback((): Element[] => {
    return Array.from(bodyMapRef.current.values())
  }, [])

  const getBodyForChapter = useCallback(
    (id: number): Element | null => bodyMapRef.current.get(Number(id)) ?? null,
    []
  )

  const registerBody = useCallback(
    (id: number, el: Element | null) => {
      if (el) bodyMapRef.current.set(Number(id), el)
      else bodyMapRef.current.delete(Number(id))
      registerDomBody(id, el)
      requestAnimationFrame(() => selectionBridgeRef.current?.applyMarks())
    },
    [registerDomBody]
  )

  const registerScrollRoot = useCallback(
    (el: HTMLElement | null) => {
      scrollRootRef.current = el
      registerDomScrollRoot(el)
    },
    [registerDomScrollRoot]
  )

  const registerViewport = useCallback(
    (el: HTMLElement | null) => {
      viewportRef.current = el
      registerDomViewport(el)
    },
    [registerDomViewport]
  )

  const getScrollRootStable = useCallback(() => scrollRootRef.current, [])
  const getViewportElStable = useCallback(() => viewportRef.current, [])

  const syncVerticalChapterEnd = useCallback(() => {
    if (horizontalEnabled) return
    const root = scrollRootRef.current
    if (!root) return

    const scrollTop = root.scrollTop
    const clientHeight = root.clientHeight || 0
    const scrollHeight = root.scrollHeight
    const atEnd = scrollTop + clientHeight >= scrollHeight - 48

    updateReadingSnapshot({ atChapterEnd: atEnd })
    syncTrialEndTip()
    scheduleReadingPositionReport()
  }, [horizontalEnabled, updateReadingSnapshot, syncTrialEndTip])

  useEffect(() => {
    selectionBridgeRef.current?.applyMarks()
  }, [chapterId, horizontalEnabled, lines, notes])

  useEffect(() => {
    syncTrialEndTip()
  }, [chapterId, pageIndex, pageCount, horizontalEnabled, isLoggedIn, syncTrialEndTip])

  useEffect(() => {
    const root = scrollRootRef.current
    if (!root || horizontalEnabled) return

    const onScroll = () => syncVerticalChapterEnd()
    root.addEventListener('scroll', onScroll, { passive: true })
    syncVerticalChapterEnd()
    return () => root.removeEventListener('scroll', onScroll)
  }, [horizontalEnabled, chapterId, syncVerticalChapterEnd])

  const chapterBookmarks = getMergedChapterBookmarks(chapterId, bookmarks)
  const snapshot = computeReadingSnapshotFromDom()
  const currentBookmark = findBookmarkAtSnapshot(chapterBookmarks, snapshot, {
    horizontal: horizontalEnabled,
    pageCount,
    pageIndex
  })
  const showBookmarkBadge = isLoggedIn && Boolean(currentBookmark)
  const showInlineLoginTip = Boolean(readTip.showInline && !isLoggedIn && !horizontalEnabled)

  useBookCss({
    bookId,
    bookMeta: bookMeta ?? { bookId, bookName: '', author: '', bookPic: '' },
    getContentBodies,
    getScrollRoot: getScrollRootStable,
    contentRevision: `${chapterId}:${horizontalEnabled}:${Object.keys(chapters).length}`
  })

  return (
    <>
      {flipMode === 'slide' ? (
        <HorizontalReader
          chapterList={chapterList}
          chapters={chapters}
          isChapterBlocked={isChapterBlocked}
          onChapterChange={onChapterChange}
          onError={onError}
          selectionBridgeRef={selectionBridgeRef}
          registerBody={registerBody}
          registerViewport={registerViewport}
          registerScrollRoot={registerScrollRoot}
          paidChapterStart={paidChapterStart}
          isLoggedIn={isLoggedIn}
          onLinkClick={onLinkClick}
        />
      ) : flipMode !== 'vertical' ? (
        <PagedReader
          chapterList={chapterList}
          chapters={chapters}
          isChapterBlocked={isChapterBlocked}
          onChapterChange={onChapterChange}
          onError={onError}
          selectionBridgeRef={selectionBridgeRef}
          registerBody={registerBody}
          registerViewport={registerViewport}
          registerScrollRoot={registerScrollRoot}
          paidChapterStart={paidChapterStart}
          isLoggedIn={isLoggedIn}
          onLinkClick={onLinkClick}
        />
      ) : (
        <VerticalReader
          chapterList={chapterList}
          chapters={chapters}
          chapterLoadStates={chapterLoadStates}
          isChapterBlocked={isChapterBlocked}
          onChapterChange={onChapterChange}
          onError={onError}
          selectionBridgeRef={selectionBridgeRef}
          registerBody={registerBody}
          registerScrollRoot={registerScrollRoot}
          noteBadgesRef={verticalBadgesRef}
          onLinkClick={onLinkClick}
          inlineLoginTip={
            <ReadLoginTip
              variant="inline"
              visible={showInlineLoginTip}
              onLoginRequired={onLoginRequired}
            />
          }
        />
      )}

      {showBookmarkBadge ? (
        <img
          className="reader-content__bookmark-badge"
          src={BOOKMARK_ICON_URL}
          alt="已添加书签"
        />
      ) : null}

      <SelectionLayer
        ref={selectionBridgeRef}
        bookId={bookId}
        isLoggedIn={isLoggedIn}
        lines={lines}
        notes={notes}
        horizontalEnabled={horizontalEnabled}
        chapterId={chapterId}
        getContentBodies={getContentBodies}
        getBodyForChapter={getBodyForChapter}
        getScrollRoot={getScrollRootStable}
        getViewportEl={getViewportElStable}
        onLineCreate={onLineCreate}
        onLineUpdate={onLineUpdate}
        onLineDelete={onLineDelete}
        onNoteCreate={onNoteCreate}
        onNoteDelete={onNoteDelete}
        onAnnotationError={onAnnotationError}
        onLoginRequired={onLoginRequired ? (r) => onLoginRequired(r) : undefined}
        noteBadgesMode={horizontalEnabled ? 'fixed' : 'scroll'}
        noteBadgesContainerRef={verticalBadgesRef}
      />

      <WriteAnnotationPanel
        onPublishNote={(draft) => selectionBridgeRef.current?.handlePublishNote(draft)}
      />
    </>
  )
}
