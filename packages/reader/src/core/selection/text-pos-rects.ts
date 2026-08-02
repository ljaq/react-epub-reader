/**
 * 选区矩形与边界点辅助。
 *
 * 源码对照：old-vue-reader/utils/selection-text-pos.js:392-526
 */

import { SELECTION_MODE_VERTICAL, type SelectionMode } from './dom-path'
import type { Boundary, HighlightPosItem } from './text-pos'

export interface SelectionBoundingRect {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

/** 取高亮项列表的并集屏幕矩形（减去 pageY 偏移得到视口坐标）。对齐 Vue selection-text-pos.js:392 */
export function getSelectionBoundingRect(
  list: HighlightPosItem[] | null,
  mode: SelectionMode = SELECTION_MODE_VERTICAL,
  scrollTop: number = 0
): SelectionBoundingRect | null {
  if (!list?.length) {
    return null
  }

  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity

  list.forEach(item => {
    top = Math.min(top, item.top)
    left = Math.min(left, item.left)
    right = Math.max(right, item.right)
    bottom = Math.max(bottom, item.bottom)
  })

  const pageY = mode === SELECTION_MODE_VERTICAL ? scrollTop : 0

  return {
    top: top - pageY,
    left,
    width: right - left,
    height: bottom - top,
    right,
    bottom
  }
}

export interface HandleRect {
  top: number
  left: number
  width: number
  height: number
  right?: number
  bottom?: number
}

export interface BoundaryHandleRects {
  start: HandleRect | null
  end: HandleRect | null
  boundary1Screen: Boundary | null
  boundary2Screen: Boundary | null
  needUp?: boolean
}

/**
 * 取选区首尾拖拽手柄矩形 + boundary 屏幕坐标。list 非空时用首/末项；
 * 否则用 boundary1/boundary2 原值（减 pageY）。对齐 Vue selection-text-pos.js:421。
 */
export function getBoundaryHandleRects(
  list: HighlightPosItem[] | null,
  boundary1: Boundary | null,
  boundary2: Boundary | null,
  needUp: boolean,
  mode: SelectionMode = SELECTION_MODE_VERTICAL,
  scrollTop: number = 0
): BoundaryHandleRects {
  const pageY = mode === SELECTION_MODE_VERTICAL ? scrollTop : 0

  if (list?.length) {
    const first = list[0]
    const last = list[list.length - 1]

    return {
      start: {
        top: first.top - pageY,
        left: first.left,
        width: first.right - first.left,
        height: first.h || first.bottom - first.top
      },
      end: {
        top: last.top - pageY,
        left: last.right,
        width: last.right - last.left,
        height: last.h || last.bottom - last.top,
        right: last.right,
        bottom: last.bottom - pageY
      },
      boundary1Screen: { x: first.left, y: first.top - pageY },
      boundary2Screen: { x: last.right, y: last.top - pageY }
    }
  }

  if (boundary1 && boundary2) {
    return {
      start: { top: boundary1.y - pageY, left: boundary1.x, width: 0, height: 0 },
      end: {
        top: boundary2.y - pageY,
        left: boundary2.x,
        width: 0,
        height: 0,
        right: boundary2.x,
        bottom: boundary2.y - pageY
      },
      boundary1Screen: { x: boundary1.x, y: boundary1.y - pageY },
      boundary2Screen: { x: boundary2.x, y: boundary2.y - pageY },
      needUp
    }
  }

  return { start: null, end: null, boundary1Screen: null, boundary2Screen: null }
}

/** 高亮项坐标从文档坐标转屏幕坐标（竖滚减 pageY）。用于渲染浮层。对齐 Vue selection-text-pos.js:494 */
export function toScreenRects(
  list: HighlightPosItem[] | null,
  mode: SelectionMode = SELECTION_MODE_VERTICAL,
  scrollTop: number = 0
): HighlightPosItem[] {
  const pageY = mode === SELECTION_MODE_VERTICAL ? scrollTop : 0

  return (list || []).map(item => ({
    ...item,
    top: item.top - pageY,
    bottom: item.bottom - pageY
  }))
}

/** 由段落块初始构造 boundary1/boundary2（左上 ↔ 右下，含 pageY 偏移与视口 clamp）。对齐 Vue selection-text-pos.js:504 */
export function buildInitialBoundaries(
  el: Element,
  mode: SelectionMode,
  scrollTop: number = 0
): { boundary1: Boundary; boundary2: Boundary } {
  const bcr = el.getBoundingClientRect()
  const pageY = mode === SELECTION_MODE_VERTICAL ? scrollTop : 0

  return {
    boundary1: {
      x: Math.max(0, bcr.left),
      y: Math.max(bcr.top + pageY, 0)
    },
    boundary2: {
      x: Math.min(bcr.right, window.innerWidth),
      y: Math.min(bcr.bottom + pageY, window.innerHeight + pageY)
    }
  }
}

/** 屏幕坐标 → 文档坐标边界点（竖滚加 pageY）。对齐 Vue selection-text-pos.js:520 */
export function clientToBoundaryPoint(
  clientX: number,
  clientY: number,
  mode: SelectionMode,
  scrollTop: number = 0
): Boundary {
  const pageY = mode === SELECTION_MODE_VERTICAL ? scrollTop : 0
  return { x: clientX, y: clientY + pageY }
}
