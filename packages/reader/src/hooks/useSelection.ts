/**
 * 选中交互 hook — 基于 core/selection createSelectionEngine。
 *
 * 源码对照：old-vue-reader/components/ReaderContent/index.vue
 * LONG_PRESS_MS=450:174 / LONG_PRESS_MOVE_THRESHOLD=10:175
 * handleBodyTouchStart/Move/End:1920-1981 / triggerLongPressSelection:1989
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  createSelectionEngine,
  SELECTION_MODE_HORIZONTAL,
  SELECTION_MODE_VERTICAL,
  type SelectionPayload
} from '../core/selection'
import { getLineMarksUnionRect } from '../core/highlights/line'
import { useAnnotationStore, type SelectionDisplayState } from '../store/annotation-store'
import { useReadingStore } from '../store/reading-store'

export const LONG_PRESS_MS = 450
export const LONG_PRESS_MOVE_THRESHOLD = 10

export interface UseSelectionInput {
  horizontalEnabled: boolean
  getContentBodies: () => Element[]
  getBodyForChapter: (chapterId: number) => Element | null
  getScrollRoot: () => HTMLElement | null
  getViewportEl: () => HTMLElement | null
  chapterId: number
}

function payloadToSelection(payload: SelectionPayload): SelectionDisplayState {
  return {
    mode: 'text',
    text: payload.text,
    posInfo: payload.posInfo,
    domPosBase: payload.domPosBase,
    rect: payload.rect,
    chapterId: payload.chapterId,
    highlightPosList: payload.highlightPosList,
    boundary1: payload.boundary1
      ? { x: payload.boundary1.x, y: payload.boundary1.y, h: payload.handleStart?.height }
      : null,
    boundary2: payload.boundary2
      ? { x: payload.boundary2.x, y: payload.boundary2.y, h: payload.handleEnd?.height }
      : null,
    needUp: payload.needUp,
    handleStart: payload.handleStart,
    handleEnd: payload.handleEnd
  }
}

function rectsEqual(
  a: SelectionDisplayState['rect'],
  b: SelectionDisplayState['rect']
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

export function useSelection(input: UseSelectionInput) {
  const {
    horizontalEnabled,
    getContentBodies,
    getBodyForChapter,
    getScrollRoot,
    getViewportEl,
    chapterId
  } = input

  const selection = useAnnotationStore((s) => s.selection)
  const setSelection = useAnnotationStore((s) => s.setSelection)
  const clearSelection = useAnnotationStore((s) => s.clearSelection)
  const dragOffset = useReadingStore((s) => s.dragOffset)

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressActivatedRef = useRef(false)
  const isHandleDraggingRef = useRef(false)
  const recentlyHandleDraggedRef = useRef(false)
  const handleDragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const engine = useMemo(
    () =>
      createSelectionEngine({
        getBodies: getContentBodies,
        getMode: () => (horizontalEnabled ? SELECTION_MODE_HORIZONTAL : SELECTION_MODE_VERTICAL),
        getScrollTop: () => {
          if (horizontalEnabled) return 0
          return getScrollRoot()?.scrollTop || 0
        },
        getScrollContainer: () => getViewportEl(),
        getChapterIdForBody: (body) => {
          if (horizontalEnabled) {
            return Number(body.closest('[data-segment-id]')?.getAttribute('data-segment-id')) || chapterId
          }
          return chapterId
        }
      }),
    [horizontalEnabled, getContentBodies, getScrollRoot, getViewportEl, chapterId]
  )

  const clearNativeSelection = useCallback(() => {
    const sel = window.getSelection()
    if (sel?.rangeCount) {
      sel.removeAllRanges()
    }
  }, [])

  const clearSelectionState = useCallback(() => {
    longPressActivatedRef.current = false
    engine.clear()
    clearSelection()
    clearNativeSelection()
  }, [engine, clearSelection, clearNativeSelection])

  const applySelectionPayload = useCallback(
    (payload: SelectionPayload | null) => {
      if (!payload) return
      clearNativeSelection()
      setSelection(payloadToSelection(payload))
    },
    [clearNativeSelection, setSelection]
  )

  const refreshSelectionPosition = useCallback(() => {
    const current = useAnnotationStore.getState().selection
    if (!current) return

    if (current.mode === 'line' && current.webLineId && current.chapterId) {
      const body = getBodyForChapter(current.chapterId)
      if (!body) return
      const rect = getLineMarksUnionRect(body, current.webLineId)
      if (!rect) return
      const nextRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      if (rectsEqual(current.rect, nextRect)) return
      setSelection({ ...current, rect: nextRect })
      return
    }

    if (current.mode !== 'text') return

    const payload = engine.refreshOnScroll()
    if (!payload) return

    const next = { ...current, ...payloadToSelection(payload) }
    const rectSame =
      (current.rect?.top ?? 0) === (next.rect?.top ?? 0) &&
      (current.rect?.left ?? 0) === (next.rect?.left ?? 0) &&
      (current.rect?.width ?? 0) === (next.rect?.width ?? 0) &&
      (current.rect?.height ?? 0) === (next.rect?.height ?? 0)
    const listSame =
      (current.highlightPosList?.length ?? 0) === (next.highlightPosList?.length ?? 0)

    if (rectSame && listSame) {
      return
    }

    setSelection(next)
  }, [engine, getBodyForChapter, setSelection])

  /** 取消尚未触发的长按计时（不清除已展示的选区） */
  const cancelPendingLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
    engine.longPressCancel()
  }, [engine])

  const cancelLongPressIfMoved = useCallback(
    (clientX: number, clientY: number) => {
      if (!longPressStartRef.current) return
      const dx = clientX - longPressStartRef.current.x
      const dy = clientY - longPressStartRef.current.y
      if (
        Math.abs(dx) > LONG_PRESS_MOVE_THRESHOLD ||
        Math.abs(dy) > LONG_PRESS_MOVE_THRESHOLD
      ) {
        cancelPendingLongPress()
      }
    },
    [cancelPendingLongPress]
  )

  const triggerLongPressSelection = useCallback(
    (clientX: number, clientY: number) => {
      const payload = engine.buildSelectedArea(clientX, clientY)
      if (payload) {
        longPressActivatedRef.current = true
      }
      applySelectionPayload(payload)
    },
    [engine, applySelectionPayload]
  )

  useEffect(() => {
    if (dragOffset !== 0) {
      cancelPendingLongPress()
    }
    refreshSelectionPosition()
  }, [dragOffset, refreshSelectionPosition, cancelPendingLongPress])

  useEffect(() => {
    const root = getScrollRoot()
    if (!root) return
    const onScroll = () => {
      cancelPendingLongPress()
      refreshSelectionPosition()
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [getScrollRoot, refreshSelectionPosition, cancelPendingLongPress])

  const onBodyContextMenu = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.closest('.reader-content__body')) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  useEffect(() => {
    const root = getScrollRoot()
    if (!root) return

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      const target = event.target as HTMLElement
      if (!target.closest('.reader-content__body')) return
      if (
        target.closest('.reader-note-badge') ||
        target.closest('.reader-chapter-btn') ||
        target.closest('.selection-handle') ||
        target.closest('.selection-bubble')
      ) {
        return
      }

      longPressStartRef.current = { x: touch.clientX, y: touch.clientY }
      engine.longPressStart(touch.clientX, touch.clientY)
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
      longPressTimerRef.current = setTimeout(() => {
        triggerLongPressSelection(touch.clientX, touch.clientY)
      }, LONG_PRESS_MS)
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return

      if (engine.isActive || isHandleDraggingRef.current) {
        event.preventDefault()
        return
      }

      cancelLongPressIfMoved(touch.clientX, touch.clientY)
    }

    const onTouchEnd = () => {
      cancelPendingLongPress()
    }

    // 横滑翻页走 pointer + setPointerCapture，touchmove 可能到不了 root；
    // capture 阶段监听 pointermove 以在滑动时取消长按。
    const onPointerMoveCapture = (event: PointerEvent) => {
      if (engine.isActive || isHandleDraggingRef.current) return
      cancelLongPressIfMoved(event.clientX, event.clientY)
    }

    const onTouchCancel = () => {
      cancelPendingLongPress()
    }

    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('touchend', onTouchEnd)
    root.addEventListener('touchcancel', onTouchCancel)
    root.addEventListener('pointermove', onPointerMoveCapture, { capture: true, passive: true })
    root.addEventListener('contextmenu', onBodyContextMenu, { capture: true })

    return () => {
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('touchend', onTouchEnd)
      root.removeEventListener('touchcancel', onTouchCancel)
      root.removeEventListener('pointermove', onPointerMoveCapture, true)
      root.removeEventListener('contextmenu', onBodyContextMenu, true)
    }
  }, [
    getScrollRoot,
    engine,
    triggerLongPressSelection,
    cancelPendingLongPress,
    cancelLongPressIfMoved,
    onBodyContextMenu
  ])

  const markRecentlyHandleDragged = useCallback(() => {
    recentlyHandleDraggedRef.current = true
    if (handleDragResetTimerRef.current) {
      clearTimeout(handleDragResetTimerRef.current)
    }
    handleDragResetTimerRef.current = setTimeout(() => {
      recentlyHandleDraggedRef.current = false
    }, 300)
  }, [])

  const onBoundaryDragStart = useCallback(
    (handle: 'start' | 'end') => {
      isHandleDraggingRef.current = true
      engine.startBoundaryDrag(handle)
    },
    [engine]
  )

  const onBoundaryDragMove = useCallback(
    ({ clientX, clientY }: { handle: 'start' | 'end'; clientX: number; clientY: number }) => {
      const payload = engine.updateBoundaryDrag(clientX, clientY)
      if (payload) {
        const current = useAnnotationStore.getState().selection
        setSelection({ ...(current || payloadToSelection(payload)), ...payloadToSelection(payload) })
      }
    },
    [engine, setSelection]
  )

  const onBoundaryDragEnd = useCallback(() => {
    isHandleDraggingRef.current = false
    markRecentlyHandleDragged()
    const payload = engine.endBoundaryDrag()
    if (payload) {
      const current = useAnnotationStore.getState().selection
      setSelection({ ...(current || payloadToSelection(payload)), ...payloadToSelection(payload) })
      return
    }
    clearSelectionState()
  }, [engine, markRecentlyHandleDragged, setSelection, clearSelectionState])

  const shouldBlockFlip = useCallback(() => {
    return Boolean(
      engine.isActive ||
        engine.curBoundary ||
        useAnnotationStore.getState().selection ||
        isHandleDraggingRef.current
    )
  }, [engine])

  const shouldIgnoreTap = useCallback(
    (event: React.MouseEvent | React.PointerEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest('.selection-bubble') ||
        target.closest('.selection-handle') ||
        target.closest('.selection-handles') ||
        target.closest('.annotation-list-popup')
      ) {
        return true
      }
      if (recentlyHandleDraggedRef.current) return true
      if (longPressActivatedRef.current) {
        longPressActivatedRef.current = false
        return true
      }
      if (useAnnotationStore.getState().selection) {
        clearSelectionState()
        return true
      }
      return false
    },
    [clearSelectionState]
  )

  const isActive = Boolean(selection || engine.isActive)

  return {
    selection,
    engine,
    isActive,
    clearSelectionState,
    refreshSelectionPosition,
    shouldBlockFlip,
    shouldIgnoreTap,
    handleHandlers: {
      onBoundaryDragStart,
      onBoundaryDragMove,
      onBoundaryDragEnd
    }
  }
}
