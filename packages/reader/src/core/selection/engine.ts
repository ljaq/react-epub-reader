/**
 * 选区引擎（createSelectionEngine）。
 *
 * 源码对照：old-vue-reader/utils/selection-engine.js:1-265
 *
 * 长按 450ms 常量在 ReaderContent 中触发（Phase 4 用），本引擎仅暴露
 * longPressStart/longPressCancel 占位接口与 touchX/touchY 记录。
 */

import {
  encodeDomPath,
  findBodyFromPoint,
  findParagraphFromPoint,
  getDomsInView,
  SELECTION_MODE_VERTICAL,
  type SelectionMode
} from './dom-path'
import {
  adjustHighlightDist,
  getTextsPos,
  highlightPosListToPosInfo,
  highlightPosListToText,
  isChineseDominant,
  normalizeBoundaries,
  type Boundary,
  type HighlightPosItem
} from './text-pos'
import {
  buildInitialBoundaries,
  clientToBoundaryPoint,
  getBoundaryHandleRects,
  getSelectionBoundingRect,
  toScreenRects
} from './text-pos-rects'

export interface SelectionEngineOptions {
  getBodies?: () => Element[]
  getMode?: () => SelectionMode
  getScrollTop?: () => number
  getScrollContainer?: () => Element | null
  getChapterIdForBody?: (body: Element) => number | null
}

export interface SelectionState {
  active: boolean
  boundary1: Boundary | null
  boundary2: Boundary | null
  highlightPosList: HighlightPosItem[]
  needUp: boolean
  curBoundary: number
  chapterId: number | null
  body: Element | null
  anchorEl: Element | null
  touchX: number
  touchY: number
}

export interface SelectionPayload {
  mode: 'text'
  text: string
  posInfo: Record<string, number>
  domPosBase: string
  rect: ReturnType<typeof getSelectionBoundingRect>
  chapterId: number | null
  highlightPosList: HighlightPosItem[]
  boundary1: Boundary
  boundary2: Boundary
  needUp: boolean
  handleStart: ReturnType<typeof getBoundaryHandleRects>['start']
  handleEnd: ReturnType<typeof getBoundaryHandleRects>['end']
}

function createEmptyState(): SelectionState {
  return {
    active: false,
    boundary1: null,
    boundary2: null,
    highlightPosList: [],
    needUp: false,
    curBoundary: 0,
    chapterId: null,
    body: null,
    anchorEl: null,
    touchX: 0,
    touchY: 0
  }
}

/**
 * 创建选区引擎。options 注入 bodies/mode/scrollTop/scrollContainer/chapterId 的获取器
 * （由 Phase 4 hooks 提供 DOM 与状态）。返回引擎实例，含长按、建区、拖拽边界、滚动刷新、清除等方法。
 * 长按 450ms 由 ReaderContent(Phase 4)触发，本引擎仅暴露 longPressStart/Cancel 占位与 touchX/Y 记录。
 * 对齐 Vue selection-engine.js:38。
 */
export function createSelectionEngine(options: SelectionEngineOptions = {}) {
  const {
    getBodies = () => [],
    getMode = () => SELECTION_MODE_VERTICAL,
    getScrollTop = () => 0,
    getScrollContainer = () => null,
    getChapterIdForBody = () => null
  } = options

  let state = createEmptyState()

  function getContext() {
    return {
      mode: getMode(),
      scrollTop: getScrollTop(),
      bodies: getBodies(),
      scrollContainer: getScrollContainer()
    }
  }

  function recomputeHighlightPosList(): HighlightPosItem[] {
    const { mode, scrollTop, bodies, scrollContainer } = getContext()
    if (!state.active || !state.boundary1 || !state.boundary2) {
      return []
    }

    const domsInView = getDomsInView(bodies, mode, scrollContainer)
    const merged: HighlightPosItem[] = []

    domsInView.forEach(item => {
      const list = getTextsPos({
        dom: item.dom,
        pos: item.pos,
        boundary1: state.boundary1,
        boundary2: state.boundary2,
        curBoundary: state.curBoundary,
        mode,
        scrollTop
      })
      merged.push(...list)
    })

    state.highlightPosList = merged
    return merged
  }

  function buildSelectionPayload(): SelectionPayload | null {
    const { mode, scrollTop } = getContext()
    const list = state.highlightPosList || []
    const text = highlightPosListToText(list).replace(/\s+/gu, ' ').trim()

    if (!text) {
      return null
    }

    const { posInfo, domPosBase } = highlightPosListToPosInfo(list)
    const rect = getSelectionBoundingRect(list, mode, scrollTop)
    const handles = getBoundaryHandleRects(list, state.boundary1, state.boundary2, state.needUp, mode, scrollTop)

    return {
      mode: 'text',
      text,
      posInfo,
      domPosBase,
      rect,
      chapterId: state.chapterId,
      highlightPosList: toScreenRects(list, mode, scrollTop),
      boundary1: (handles.boundary1Screen as Boundary) || (state.boundary1 as Boundary),
      boundary2: (handles.boundary2Screen as Boundary) || (state.boundary2 as Boundary),
      needUp: state.needUp,
      handleStart: handles.start,
      handleEnd: handles.end
    }
  }

  function applyNormalizedBoundaries(): void {
    if (!state.boundary1 || !state.boundary2 || !state.anchorEl) {
      return
    }

    const computed = window.getComputedStyle(state.anchorEl, null)
    const lineHeight = parseInt(computed.lineHeight, 10) || 20
    const fontSize = parseInt(computed.fontSize, 10) || 16
    const normalized = normalizeBoundaries(state.boundary1, state.boundary2, state.curBoundary, lineHeight, fontSize)

    state.boundary1 = normalized.boundary1
    state.boundary2 = normalized.boundary2
    state.needUp = normalized.needUp
  }

  return {
    get isActive(): boolean {
      return state.active
    },

    get curBoundary(): number {
      return state.curBoundary
    },

    getState(): SelectionState {
      return { ...state }
    },

    longPressStart(x: number, y: number): void {
      state.touchX = x
      state.touchY = y
    },

    longPressCancel(): void {
      // no-op: long press cancellation handled by touchmove threshold in ReaderContent
    },

    buildSelectedArea(clientX: number, clientY: number): SelectionPayload | null {
      const { mode, scrollTop, bodies } = getContext()
      const body = findBodyFromPoint(clientX, clientY, bodies)
      if (!body) {
        return null
      }

      const block = findParagraphFromPoint(clientX, clientY, body)
      if (!block) {
        return null
      }

      const { boundary1, boundary2 } = buildInitialBoundaries(block, mode, scrollTop)
      state = {
        ...createEmptyState(),
        active: true,
        boundary1,
        boundary2,
        chapterId: getChapterIdForBody(body),
        body,
        anchorEl: block,
        touchX: clientX,
        touchY: clientY
      }

      const pos = encodeDomPath(block, body)
      let list = getTextsPos({
        dom: block,
        pos,
        boundary1: state.boundary1,
        boundary2: state.boundary2,
        curBoundary: 0,
        mode,
        scrollTop
      })

      const fullText = highlightPosListToText(list)
      if (!isChineseDominant(fullText)) {
        list = adjustHighlightDist(list, clientX, clientY, mode)
      }

      state.highlightPosList = list

      if (list.length) {
        state.boundary1 = { x: list[0].left, y: list[0].top }
        state.boundary2 = { x: list[list.length - 1].right, y: list[list.length - 1].bottom }
      }

      applyNormalizedBoundaries()
      return buildSelectionPayload()
    },

    startBoundaryDrag(which: 'start' | 'end' | number): void {
      if (!state.active) {
        return
      }
      state.curBoundary = which === 'start' || which === 1 ? 1 : 2
    },

    updateBoundaryDrag(clientX: number, clientY: number): SelectionPayload | null {
      if (!state.active || !state.curBoundary) {
        return null
      }

      const { mode, scrollTop } = getContext()
      const point = clientToBoundaryPoint(clientX, clientY, mode, scrollTop)

      if (state.curBoundary === 1) {
        state.boundary1 = point
      } else {
        state.boundary2 = point
      }

      applyNormalizedBoundaries()
      recomputeHighlightPosList()

      if (state.highlightPosList.length) {
        if (state.curBoundary === 1) {
          const first = state.highlightPosList[0]
          state.boundary1 = { x: first.left, y: first.top }
        } else {
          const last = state.highlightPosList[state.highlightPosList.length - 1]
          state.boundary2 = { x: last.right, y: last.bottom }
        }
      }

      return buildSelectionPayload()
    },

    endBoundaryDrag(): SelectionPayload | null {
      state.curBoundary = 0
      return buildSelectionPayload()
    },

    refreshOnScroll(): SelectionPayload | null {
      if (!state.active) {
        return null
      }
      recomputeHighlightPosList()
      return buildSelectionPayload()
    },

    clear(): void {
      state = createEmptyState()
    },

    buildSelectionPayload
  }
}
