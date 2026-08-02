/**
 * 划线/批注乐观 UI 操作 — 对照 ReaderContent handleSaveLine/handleLineColorChange/handleEraseLine。
 */
import { useCallback } from 'react'
import type { LineItem, NoteItem } from '../types'
import {
  DEFAULT_UNDERLINE_COLOR,
  detectDuplicateLine,
  getLineMarksUnionRect,
  renameLineMarkId,
  unwrapLineMark,
  updateLineMarkStyle,
  wrapLineMark
} from '../core/highlights/line'
import { syncChapterNotes, wrapNoteMark, groupChapterNotes } from '../core/highlights/note'
import { generateReaderWebId } from '../core/reading-position/pos-info'
import { useAnnotationStore, type SelectionDisplayState } from '../store/annotation-store'
import { useUiStore } from '../store/ui-store'

export interface AnnotationActionsContext {
  bookId: number
  isLoggedIn: boolean
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  getBodyForChapter: (chapterId: number) => Element | null
  getChapterLinesData: (chapterId: number) => { data: Record<string, LineItem> }
  getChapterNotesData: (chapterId: number) => { data: Record<string, NoteItem> }
  onLineCreate?: (payload: LineItem) => void
  onLineUpdate?: (payload: LineItem) => void
  onLineDelete?: (payload: { bookId: number; webLineId: string }) => void
  onNoteCreate?: (payload: NoteItem) => void
  onNoteDelete?: (payload: { bookId: number; webNoteId: string }) => void
  onAnnotationError?: (payload: { clientId: string; type: 'line' | 'note' | 'bookmark'; error: unknown }) => void
  onLoginRequired?: (reason: 'auth') => void
  clearSelectionState: () => void
}

export function useAnnotationActions(ctx: AnnotationActionsContext) {
  const showToast = useUiStore((s) => s.showToast)
  const preferredLineColor = useAnnotationStore((s) => s.preferredLineColor)
  const setPreferredLineColor = useAnnotationStore((s) => s.setPreferredLineColor)
  const addPendingLine = useAnnotationStore((s) => s.addPendingLine)
  const removePendingLine = useAnnotationStore((s) => s.removePendingLine)
  const addPendingNote = useAnnotationStore((s) => s.addPendingNote)
  const removePendingNote = useAnnotationStore((s) => s.removePendingNote)
  const openAnnotationPanel = useAnnotationStore((s) => s.openAnnotationPanel)
  const setSelection = useAnnotationStore((s) => s.setSelection)

  const ensureLoggedIn = useCallback((): boolean => {
    if (ctx.isLoggedIn) return true
    ctx.onLoginRequired?.('auth')
    return false
  }, [ctx])

  const handleSaveLine = useCallback(
    (selection: SelectionDisplayState) => {
      if (!ensureLoggedIn()) return

      const { text, chapterId, posInfo } = selection
      if (!chapterId) return

      const body = ctx.getBodyForChapter(chapterId)
      const chapterLinesData = ctx.getChapterLinesData(chapterId)
      const duplicateLineId = detectDuplicateLine({
        posInfo: posInfo || {},
        chapterLinesData,
        bodyEl: body || undefined
      })

      if (duplicateLineId) {
        showToast('不能重复添加')
        return
      }

      const underlineColor = preferredLineColor || DEFAULT_UNDERLINE_COLOR
      const webLineId = generateReaderWebId()
      const lineData: LineItem = {
        id: null,
        webLineId,
        clientId: webLineId,
        chapterId,
        summary: text,
        posInfo: posInfo || {},
        underlineColor,
        time: '刚刚'
      }

      if (!body || !wrapLineMark(body, lineData)) {
        showToast('划线失败')
        return
      }

      addPendingLine(chapterId, lineData)
      ctx.onLineCreate?.(lineData)
      ctx.clearSelectionState()
    },
    [ensureLoggedIn, preferredLineColor, ctx, addPendingLine, showToast]
  )

  const handleLineColorChange = useCallback(
    (selection: SelectionDisplayState, color: string) => {
      if (!ensureLoggedIn()) return

      const { text, chapterId, posInfo, webLineId } = selection
      if (!webLineId || !color || !chapterId) return

      const lineItem = ctx.getChapterLinesData(chapterId)?.data?.[webLineId]
      const previousColor = lineItem?.underlineColor || selection.underlineColor || DEFAULT_UNDERLINE_COLOR
      const nextLineData: LineItem = {
        ...(lineItem || {
          id: null,
          webLineId,
          chapterId,
          summary: text,
          posInfo: posInfo || {}
        }),
        webLineId,
        clientId: webLineId,
        chapterId,
        summary: text || lineItem?.summary || '',
        posInfo: posInfo || lineItem?.posInfo || {},
        underlineColor: color
      }

      setPreferredLineColor(color)
      addPendingLine(chapterId, nextLineData)

      const body = ctx.getBodyForChapter(chapterId)
      if (body) {
        updateLineMarkStyle(body, webLineId, color)
      }

      setSelection({ ...selection, underlineColor: color })
      ctx.onLineUpdate?.(nextLineData)

      // 宿主失败时由 props 未 reconcile + 宿主回滚触发；此处仅 fire-and-forget
      void previousColor
    },
    [ensureLoggedIn, ctx, addPendingLine, setPreferredLineColor, setSelection]
  )

  const rollbackLineColor = useCallback(
    (
      chapterId: number,
      webLineId: string,
      lineItem: LineItem | undefined,
      previousColor: string,
      selection: SelectionDisplayState
    ) => {
      if (lineItem) {
        addPendingLine(chapterId, { ...lineItem, underlineColor: previousColor })
      }
      const body = ctx.getBodyForChapter(chapterId)
      if (body) {
        updateLineMarkStyle(body, webLineId, previousColor)
      }
      setSelection({ ...selection, underlineColor: previousColor })
      showToast('修改失败，请重试')
    },
    [addPendingLine, ctx, setSelection, showToast]
  )

  const handleEraseLine = useCallback(
    (selection: SelectionDisplayState) => {
      if (!ensureLoggedIn()) return

      const { webLineId, chapterId } = selection
      if (!webLineId || !chapterId) return

      const lineItem = ctx.getChapterLinesData(chapterId)?.data?.[webLineId]
      const body = ctx.getBodyForChapter(chapterId)

      removePendingLine(chapterId, webLineId)
      if (body) {
        unwrapLineMark(body, webLineId)
      }
      ctx.clearSelectionState()
      ctx.onLineDelete?.({ bookId: ctx.bookId, webLineId })

      // rollback 由宿主 onAnnotationError 或 props 失败场景触发
      void lineItem
    },
    [ensureLoggedIn, ctx, removePendingLine]
  )

  const rollbackEraseLine = useCallback(
    (chapterId: number, webLineId: string, lineItem: LineItem) => {
      addPendingLine(chapterId, lineItem)
      const body = ctx.getBodyForChapter(chapterId)
      if (body) {
        wrapLineMark(body, { ...lineItem, webLineId })
      }
      showToast('擦除失败，请重试')
    },
    [addPendingLine, ctx, showToast]
  )

  const rollbackSaveLine = useCallback(
    (chapterId: number, webLineId: string) => {
      const body = ctx.getBodyForChapter(chapterId)
      if (body) {
        unwrapLineMark(body, webLineId)
      }
      removePendingLine(chapterId, webLineId)
      showToast('划线失败，请重试')
      ctx.onAnnotationError?.({ clientId: webLineId, type: 'line', error: new Error('save line failed') })
    },
    [ctx, removePendingLine, showToast]
  )

  const handleOpenAnnotation = useCallback(
    (selection: SelectionDisplayState) => {
      if (!ensureLoggedIn()) return
      if (!selection.chapterId) return

      openAnnotationPanel({
        text: selection.text,
        chapterId: selection.chapterId,
        posInfo: selection.posInfo || {},
        webLineId: selection.webLineId || '',
        mode: selection.mode
      })
      ctx.clearSelectionState()
    },
    [ensureLoggedIn, openAnnotationPanel, ctx]
  )

  const handlePublishNote = useCallback(
    (draft: { text: string; chapterId: number; posInfo: Record<string, number>; content: string }) => {
      if (!ensureLoggedIn()) return

      const webNoteId = generateReaderWebId()
      const noteData: NoteItem = {
        id: null,
        webNoteId,
        clientId: webNoteId,
        chapterId: draft.chapterId,
        posInfo: draft.posInfo || {},
        summary: draft.text,
        content: draft.content,
        time: '刚刚'
      }

      const body = ctx.getBodyForChapter(draft.chapterId)
      addPendingNote(draft.chapterId, noteData)

      if (body) {
        const chapterNotesData = ctx.getChapterNotesData(draft.chapterId)
        const groups = groupChapterNotes(chapterNotesData)
        const group = groups.find((g) => g.summary === draft.text)
        if (group) {
          wrapNoteMark(body, { ...group, notes: [...group.notes, noteData] })
        } else {
          syncChapterNotes(body, {
            data: { ...chapterNotesData.data, [webNoteId]: noteData }
          })
        }
      }

      ctx.onNoteCreate?.(noteData)
      ctx.clearSelectionState()
    },
    [ensureLoggedIn, addPendingNote, ctx]
  )

  const rollbackSaveNote = useCallback(
    (chapterId: number, webNoteId: string) => {
      removePendingNote(chapterId, webNoteId)
      const body = ctx.getBodyForChapter(chapterId)
      if (body) {
        const chapterNotesData = ctx.getChapterNotesData(chapterId)
        const nextData = { ...chapterNotesData.data }
        delete nextData[webNoteId]
        syncChapterNotes(body, { data: nextData })
      }
      showToast('保存失败，请重试')
      ctx.onAnnotationError?.({ clientId: webNoteId, type: 'note', error: new Error('save note failed') })
    },
    [ctx, removePendingNote, showToast]
  )

  const handleCopySelection = useCallback(
    async (selection: SelectionDisplayState) => {
      const text = selection.text
      if (!text) return

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          const textarea = document.createElement('textarea')
          textarea.value = text
          textarea.setAttribute('readonly', '')
          textarea.style.position = 'fixed'
          textarea.style.left = '-9999px'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
        }
        showToast('复制成功')
      } catch {
        showToast('复制失败')
      }
      ctx.clearSelectionState()
    },
    [ctx, showToast]
  )

  const handleBubbleAction = useCallback(
    (payload: { action: string; selection: SelectionDisplayState; color?: string }) => {
      const { action, selection, color } = payload
      if (!selection) return

      switch (action) {
        case 'line':
          handleSaveLine(selection)
          break
        case 'line-color':
          if (color) handleLineColorChange(selection, color)
          break
        case 'erase':
          handleEraseLine(selection)
          break
        case 'copy':
          void handleCopySelection(selection)
          break
        case 'annotate':
          handleOpenAnnotation(selection)
          break
        default:
          break
      }
    },
    [handleSaveLine, handleLineColorChange, handleEraseLine, handleCopySelection, handleOpenAnnotation]
  )

  const handleLineMarkClick = useCallback(
    (lineMark: HTMLElement, chapterId: number) => {
      const webLineId = lineMark.getAttribute('data-web-line-id')
      if (!webLineId) return

      // 点击已有划线时清引擎态，避免 isActive 残留阻挡后续交互
      ctx.clearSelectionState()

      const body = ctx.getBodyForChapter(chapterId)
      const lineItem = ctx.getChapterLinesData(chapterId)?.data?.[webLineId]
      const rect = getLineMarksUnionRect(body || lineMark, webLineId) || lineMark.getBoundingClientRect()

      setSelection({
        mode: 'line',
        text: lineItem?.summary || lineMark.textContent || '',
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        },
        chapterId,
        webLineId,
        posInfo: lineItem?.posInfo || {},
        underlineColor: lineItem?.underlineColor || DEFAULT_UNDERLINE_COLOR
      })
    },
    [ctx, setSelection]
  )

  return {
    handleBubbleAction,
    handlePublishNote,
    handleLineMarkClick,
    rollbackSaveLine,
    rollbackEraseLine,
    rollbackSaveNote,
    rollbackLineColor,
    renameLineMarkId
  }
}
