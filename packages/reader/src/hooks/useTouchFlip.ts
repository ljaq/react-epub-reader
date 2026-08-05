/**
 * 横滑跟手 + 点击分区 hook — dragOffset 走 reading-store 独立 slice。
 *
 * 实现对照：novel-reader/src/hooks/useGesture.ts（React 合成 pointer 事件 +
 * setPointerCapture，统一处理 mouse/touch/pen，不区分 pointerType）。
 *
 * 关键常量（与 Vue 逐字对照）：
 * - DRAG_THRESHOLD = 40（index.vue:177）
 * - AXIS_LOCK_THRESHOLD = 8（index.vue:178）
 * - 点击左/右 20% 翻页、中央 20%-80% 唤起 UI（handleReaderAreaTap:1358）
 *
 * 事件策略：React 合成 onPointerDown/Move/Up/Cancel + setPointerCapture，
 * 统一处理所有 pointerType（mouse/touch/pen），避免 touch 事件 passive 问题。
 * dragOffset 实时写 reading-store 独立 slice，仅 track transform 重渲染。
 */
import { useCallback, useRef } from 'react'
import {
  applyGlobalDragResistance,
  resolveGlobalDragTurn,
  type DragTurnResult
} from '../core/pagination'
import { useReadingStore } from '../store/reading-store'
import { useUiStore } from '../store/ui-store'

export const DRAG_THRESHOLD = 40
export const AXIS_LOCK_THRESHOLD = 8

export interface UseTouchFlipInput {
  enabled: boolean
  shouldBlock?: () => boolean
  /**
   * 翻页提交/回弹覆写点（phase-10 覆盖模式注入动画提交）。
   * 拖拽松手判定与点击分区翻页时回调：
   * - action：'next-page'/'prev-page' 提交；'stay' 仅拖拽未过阈值的回弹场景；
   * - dragOffset：松手瞬间的原始 dx（点击为 0）。
   * 返回 true 表示覆写方接管（补间动画 + 页码提交 + dragOffset 复位 + isFlipping 收尾），
   * 本 hook 不再执行默认的 setGlobalPageIndex/setDragOffset(0)/阴影收尾。
   */
  onTurnPage?: (action: DragTurnResult, dragOffset: number) => boolean
}

export function useTouchFlip(input: UseTouchFlipInput): {
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
  }
  onClick: (e: React.MouseEvent) => void
} {
  const { enabled, shouldBlock } = input

  // 覆写点经 ref 透传，保持 endDrag/onClick 引用稳定
  const onTurnPageRef = useRef(input.onTurnPage)
  onTurnPageRef.current = input.onTurnPage

  const setDragOffset = useReadingStore((s) => s.setDragOffset)
  const setDragStartX = useReadingStore((s) => s.setDragStartX)
  const setGlobalPageIndex = useReadingStore((s) => s.setGlobalPageIndex)
  const setFlipping = useReadingStore((s) => s.setFlipping)
  const toggleUi = useUiStore((s) => s.toggleUi)

  const draggingRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const lastDxRef = useRef(0)
  const axisLockRef = useRef<'x' | 'y' | null>(null)
  const movedRef = useRef(false)
  const recentlyDraggedRef = useRef(false)
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markRecentlyDragged = useCallback(() => {
    recentlyDraggedRef.current = true
    if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current)
    dragResetTimerRef.current = setTimeout(() => {
      recentlyDraggedRef.current = false
    }, 300)
  }, [])

  const updateDragOffset = useCallback(
    (dx: number) => {
      const state = useReadingStore.getState()
      const totalPages = Math.max(1, state.buffer.totalPages || 1)
      const atBookStart = state.globalPageIndex <= 0
      const atBookEnd = state.globalPageIndex >= totalPages - 1
      const allowBookOverscroll = (atBookEnd && dx < 0) || (atBookStart && dx > 0)
      const next = applyGlobalDragResistance(dx, state.globalPageIndex, totalPages, allowBookOverscroll)
      setDragOffset(next)
    },
    [setDragOffset]
  )

  const turnPage = useCallback(
    (direction: 1 | -1) => {
      const state = useReadingStore.getState()
      const totalPages = Math.max(1, state.buffer.totalPages || 1)
      if (direction > 0) {
        if (state.globalPageIndex < totalPages - 1) {
          setGlobalPageIndex(state.globalPageIndex + 1)
        }
        return
      }
      if (state.globalPageIndex > 0) {
        setGlobalPageIndex(state.globalPageIndex - 1)
      }
    },
    [setGlobalPageIndex]
  )

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return
    const state = useReadingStore.getState()
    const totalPages = Math.max(1, state.buffer.totalPages || 1)
    const action = resolveGlobalDragTurn(
      state.globalPageIndex,
      totalPages,
      lastDxRef.current,
      DRAG_THRESHOLD
    )
    draggingRef.current = false
    pointerIdRef.current = null
    axisLockRef.current = null
    if (movedRef.current) markRecentlyDragged()
    // 覆写方（覆盖模式）接管提交/回弹动画与收尾；否则走默认直接切页。
    // 覆写回调先执行（其 fromX 捕获需读 dragStartX），随后复位手势起点。
    const handled = onTurnPageRef.current?.(action, lastDxRef.current) ?? false
    setDragStartX(0)
    if (handled) {
      return
    }
    if (action === 'next-page') turnPage(1)
    else if (action === 'prev-page') turnPage(-1)
    setDragOffset(0)
    // 翻页动画（280ms）结束后再隐藏阴影
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    flipTimerRef.current = setTimeout(() => {
      flipTimerRef.current = null
      // 若期间又开始新拖拽，保持 true
      if (!draggingRef.current) setFlipping(false)
    }, 290)
  }, [turnPage, setDragOffset, setDragStartX, markRecentlyDragged, setFlipping])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return
      const state = useReadingStore.getState()
      if (state.isRebalancing || state.layoutLocked) return
      if (shouldBlock?.()) return
      pointerIdRef.current = e.pointerId
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      startXRef.current = e.clientX
      startYRef.current = e.clientY
      lastDxRef.current = 0
      axisLockRef.current = null
      movedRef.current = false
      draggingRef.current = true
      setDragOffset(0)
      setDragStartX(e.clientX)
    },
    [enabled, shouldBlock, setDragOffset, setDragStartX]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !draggingRef.current) return
      if (pointerIdRef.current !== e.pointerId) return
      const dx = e.clientX - startXRef.current
      const dy = e.clientY - startYRef.current
      if (!axisLockRef.current) {
        if (Math.abs(dx) < AXIS_LOCK_THRESHOLD && Math.abs(dy) < AXIS_LOCK_THRESHOLD) return
        axisLockRef.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
        // 首次确定横向拖拽时才显示阴影（按下没动不显示）
        if (axisLockRef.current === 'x') setFlipping(true)
      }
      if (axisLockRef.current !== 'x') return
      e.preventDefault()
      movedRef.current = true
      lastDxRef.current = dx
      updateDragOffset(dx)
    },
    [enabled, updateDragOffset, setFlipping]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      endDrag()
    },
    [endDrag]
  )

  const onPointerCancel = useCallback(() => {
    endDrag()
  }, [endDrag])

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (recentlyDraggedRef.current) return
      const target = e.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = (e.clientX - rect.left) / rect.width
      if (ratio < 0.2) {
        if (enabled && !onTurnPageRef.current?.('prev-page', 0)) turnPage(-1)
        return
      }
      if (ratio > 0.8) {
        if (enabled && !onTurnPageRef.current?.('next-page', 0)) turnPage(1)
        return
      }
      toggleUi()
    },
    [enabled, turnPage, toggleUi]
  )

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    onClick
  }
}
