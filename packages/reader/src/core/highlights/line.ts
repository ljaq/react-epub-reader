/**
 * 划线高亮模块入口。
 *
 * 源码对照：old-vue-reader/utils/line-highlight.js（684 行）
 */

export {
  DEFAULT_UNDERLINE_COLOR,
  LINE_COLOR_BLUE,
  LINE_COLOR_MAP,
  applyLineMarkStyle,
  buildRangeFromPosInfoEntries,
  buildTargetRangeFromPosInfo,
  comparePosInfoEntries,
  findSelectableBlockAncestor,
  getPosInfoBoundaryKeys,
  groupEntriesByBlock,
  isBackgroundLineColor,
  parsePosInfoEntries,
  renameLineMarkId,
  resolveNodeFromPath,
  unwrapLineMark,
  unwrapMarkElement,
  updateLineMarkStyle,
  wrapRangeByTextNodes
} from './line-mark'
export type { PosInfoEntry } from './line-mark'

export {
  applyChapterLines,
  detectDuplicateLine,
  findLineTarget,
  getLineMarksUnionRect,
  wrapLineMark
} from './line-target'
export type { DetectDuplicateLineInput, LineItemLike } from './line-target'
