/**
 * 选区模块入口。
 *
 * 源码对照：old-vue-reader/utils/selection-engine.js + selection-text-pos.js +
 * selection-dom-path.js + selection-range.js
 */

export { SELECTION_MODE_HORIZONTAL, SELECTION_MODE_VERTICAL } from './dom-path'
export type { SelectionMode } from './dom-path'
export {
  encodeDomPath,
  findBodyFromPoint,
  findParagraphFromPoint,
  getDomsInView
} from './dom-path'
export type { DomInViewItem } from './dom-path'
export { getCaretRangeFromPoint } from './range'
export {
  adjustHighlightDist,
  getCharRect,
  getTextsPos,
  highlightPosListToPosInfo,
  highlightPosListToText,
  isChineseDominant,
  normalizeBoundaries
} from './text-pos'
export type {
  Boundary,
  CharRect,
  GetTextsPosInput,
  HighlightPosItem,
  HighlightPosListToPosInfoResult,
  NormalizeBoundariesResult
} from './text-pos'
export {
  buildInitialBoundaries,
  clientToBoundaryPoint,
  getBoundaryHandleRects,
  getSelectionBoundingRect,
  toScreenRects
} from './text-pos-rects'
export type {
  BoundaryHandleRects,
  HandleRect,
  SelectionBoundingRect
} from './text-pos-rects'
export { createSelectionEngine } from './engine'
export type { SelectionEngineOptions, SelectionPayload, SelectionState } from './engine'
