/**
 * 选中/划线/批注 UI 层 — 挂载浮层、角标同步、批注列表。
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import type { LineItem, NoteItem } from '../../../types'
import { applyChapterLines } from '../../../core/highlights/line'
import { getNotesByGroupId, syncChapterNotes, syncNoteBadges } from '../../../core/highlights/note'
import { useAnnotationStore } from '../../../store/annotation-store'
import { useAnnotationActions, type AnnotationActionsContext } from '../../../hooks/useAnnotationActions'
import { useSelection, type UseSelectionInput } from '../../../hooks/useSelection'
import { SelectionOverlay } from './SelectionOverlay'
import { SelectionHandles } from './SelectionHandles'
import { SelectionBubble } from './SelectionBubble'
import { AnnotationListPopup } from '../../popups/AnnotationListPopup/AnnotationListPopup'

export interface SelectionBridgeHandle {
  shouldBlockFlip: () => boolean
  shouldIgnoreTap: (event: React.MouseEvent) => boolean
  handleLineMarkClick: (lineMark: HTMLElement, chapterId: number) => void
  handleNoteBadgeClick: (event: React.MouseEvent, badge: HTMLElement) => void
  applyMarks: () => void
  handlePublishNote: (draft: {
    text: string
    chapterId: number
    posInfo: Record<string, number>
    content: string
  }) => void
  rollbackSaveLine: (chapterId: number, webLineId: string) => void
  rollbackSaveNote: (chapterId: number, webNoteId: string) => void
}

export interface SelectionLayerProps extends UseSelectionInput {
  bookId: number
  isLoggedIn: boolean
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  onLineCreate?: AnnotationActionsContext['onLineCreate']
  onLineUpdate?: AnnotationActionsContext['onLineUpdate']
  onLineDelete?: AnnotationActionsContext['onLineDelete']
  onNoteCreate?: AnnotationActionsContext['onNoteCreate']
  onNoteDelete?: AnnotationActionsContext['onNoteDelete']
  onAnnotationError?: AnnotationActionsContext['onAnnotationError']
  onLoginRequired?: (reason: 'auth') => void
  noteBadgesMode: 'fixed' | 'scroll'
  noteBadgesContainerRef?: React.RefObject<HTMLElement | null>
}

export const SelectionLayer = forwardRef<SelectionBridgeHandle, SelectionLayerProps>(
  function SelectionLayer(props, ref) {
    const {
      bookId,
      isLoggedIn,
      lines,
      notes,
      onLineCreate,
      onLineUpdate,
      onLineDelete,
      onNoteCreate,
      onNoteDelete,
      onAnnotationError,
      onLoginRequired,
      noteBadgesMode,
      noteBadgesContainerRef,
      ...selectionInput
    } = props

    const fixedBadgesRef = useRef<HTMLDivElement | null>(null)
    const getMergedChapterLines = useAnnotationStore((s) => s.getMergedChapterLines)
    const getMergedChapterNotes = useAnnotationStore((s) => s.getMergedChapterNotes)
    const reconcileLines = useAnnotationStore((s) => s.reconcileLines)
    const reconcileNotes = useAnnotationStore((s) => s.reconcileNotes)
    const noteListVisible = useAnnotationStore((s) => s.noteListVisible)
    const noteListItems = useAnnotationStore((s) => s.noteListItems)
    const closeNoteList = useAnnotationStore((s) => s.closeNoteList)
    const openNoteList = useAnnotationStore((s) => s.openNoteList)

    useEffect(() => {
      reconcileLines(lines)
    }, [lines, reconcileLines])

    useEffect(() => {
      reconcileNotes(notes)
    }, [notes, reconcileNotes])

    const getChapterLinesData = useCallback(
      (chapterId: number) => getMergedChapterLines(chapterId, lines),
      [getMergedChapterLines, lines]
    )

    const getChapterNotesData = useCallback(
      (chapterId: number) => getMergedChapterNotes(chapterId, notes),
      [getMergedChapterNotes, notes]
    )

    const horizontalEnabled = selectionInput.horizontalEnabled
    const chapterId = selectionInput.chapterId
    const getContentBodies = selectionInput.getContentBodies
    const getViewportEl = selectionInput.getViewportEl

    const {
      selection,
      clearSelectionState,
      shouldBlockFlip,
      shouldIgnoreTap,
      handleHandlers,
      refreshSelectionPosition
    } = useSelection(selectionInput)

    const actions = useAnnotationActions({
      bookId,
      isLoggedIn,
      lines,
      notes,
      getBodyForChapter: selectionInput.getBodyForChapter,
      getChapterLinesData,
      getChapterNotesData,
      onLineCreate,
      onLineUpdate,
      onLineDelete,
      onNoteCreate,
      onNoteDelete,
      onAnnotationError,
      onLoginRequired,
      clearSelectionState
    })

    const applyMarksToBodies = useCallback(() => {
      getContentBodies().forEach((body) => {
        const segId = Number(body.closest('[data-segment-id]')?.getAttribute('data-segment-id'))
        const cid = segId || chapterId
        applyChapterLines(body, getChapterLinesData(cid))
        syncChapterNotes(body, getChapterNotesData(cid))
      })
    }, [getContentBodies, getChapterLinesData, getChapterNotesData, chapterId])

    const syncBadges = useCallback(() => {
      const container =
        noteBadgesMode === 'fixed'
          ? fixedBadgesRef.current
          : noteBadgesContainerRef?.current || null
      syncNoteBadges(container, getContentBodies(), {
        mode: horizontalEnabled ? 'horizontal' : 'vertical',
        viewportEl: getViewportEl(),
        resolveChapterId: (rootEl) =>
          Number(rootEl.closest('[data-segment-id]')?.getAttribute('data-segment-id')) || chapterId
      })
    }, [
      noteBadgesMode,
      noteBadgesContainerRef,
      horizontalEnabled,
      chapterId,
      getContentBodies,
      getViewportEl
    ])

    useEffect(() => {
      applyMarksToBodies()
      syncBadges()
    }, [lines, notes, applyMarksToBodies, syncBadges])

    useEffect(() => {
      refreshSelectionPosition()
      syncBadges()
    }, [horizontalEnabled, chapterId, refreshSelectionPosition, syncBadges])

    const handleNoteBadgeClick = useCallback(
      (event: React.MouseEvent, badge: HTMLElement) => {
        event.stopPropagation()
        event.preventDefault()
        const groupKey = badge.getAttribute('data-note-group')
        if (!groupKey) return
        const badgeChapterId =
          Number(badge.getAttribute('data-chapter-id')) || chapterId
        const items = getNotesByGroupId(getChapterNotesData(badgeChapterId), groupKey) as NoteItem[]
        if (!items.length) return
        openNoteList(items)
      },
      [getChapterNotesData, openNoteList, chapterId]
    )

    useImperativeHandle(
      ref,
      () => ({
        shouldBlockFlip,
        shouldIgnoreTap,
        handleLineMarkClick: actions.handleLineMarkClick,
        handleNoteBadgeClick,
        applyMarks: () => {
          applyMarksToBodies()
          syncBadges()
        },
        handlePublishNote: actions.handlePublishNote,
        rollbackSaveLine: actions.rollbackSaveLine,
        rollbackSaveNote: actions.rollbackSaveNote
      }),
      [
        shouldBlockFlip,
        shouldIgnoreTap,
        actions.handleLineMarkClick,
        actions.handlePublishNote,
        actions.rollbackSaveLine,
        actions.rollbackSaveNote,
        handleNoteBadgeClick,
        applyMarksToBodies,
        syncBadges
      ]
    )

    return (
      <>
        {selection?.mode === 'text' && selection.highlightPosList?.length ? (
          <SelectionOverlay rects={selection.highlightPosList} />
        ) : null}

        {selection?.mode === 'text' ? (
        <SelectionHandles
          boundary1={selection.handleStart || selection.boundary1 || null}
          boundary2={selection.handleEnd || selection.boundary2 || null}
            needUp={selection.needUp}
            onBoundaryDragStart={handleHandlers.onBoundaryDragStart}
            onBoundaryDragMove={handleHandlers.onBoundaryDragMove}
            onBoundaryDragEnd={handleHandlers.onBoundaryDragEnd}
          />
        ) : null}

        {selection ? (
          <SelectionBubble selection={selection} onAction={actions.handleBubbleAction} />
        ) : null}

        <AnnotationListPopup visible={noteListVisible} items={noteListItems} onClose={closeNoteList} />

        {noteBadgesMode === 'fixed' ? (
          <div
            ref={fixedBadgesRef}
            className="reader-content__note-badges reader-content__note-badges--fixed"
            onClick={(e) => {
              const badge = (e.target as HTMLElement).closest('.reader-note-badge')
              if (!badge) return
              handleNoteBadgeClick(e, badge as HTMLElement)
            }}
          />
        ) : null}
      </>
    )
  }
)
