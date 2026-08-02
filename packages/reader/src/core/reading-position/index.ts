/**
 * 阅读位置模块入口。
 *
 * 源码对照：old-vue-reader/utils/pos-info.js + reading-position.js
 */

// posInfo / domPos 编解码
export {
  buildPosInfoFromHighlightPosList,
  buildPosInfoFromRange,
  buildPosInfoFromText,
  buildDomPosBaseFromRange,
  decodeBookmarkSummary,
  decodeSummary,
  encodeBookmarkSummary,
  encodeSummary,
  extractDomPosBase,
  extractDomPosFromPosInfo,
  generateBookmarkId,
  generateReaderWebId,
  getParagraphIndexFromDomPos,
  getRangeRect,
  parseStrIdxFromBookmarkId
} from './pos-info'
export type {
  BuildPosInfoFromHighlightPosListResult,
  BuildPosInfoFromRangeResult,
  DecodedBookmarkSummary,
  EncodeSummaryPayload,
  HighlightPosEntry,
  RangeRect
} from './pos-info'

// DOM 测量与文本匹配辅助
export {
  applyDomPosScroll,
  applyPrecentScroll,
  clampScrollTop,
  findNormalizedMatch,
  findParagraphIndex,
  findTextHitAtStrIdx,
  findTextNodeAtOffset,
  getParagraphElements,
  getTextNodeClientRect,
  normalizeText,
  resolveDomPosFromStrIdx,
  resolveHorizontalPageFromDomPos,
  resolveHorizontalPageFromStrIdx,
  resolveHorizontalPageFromSummary,
  resolveHorizontalPageIndexFromContentLeft,
  resolveHorizontalPageFromRect,
  scrollRangeIntoView,
  scrollRootToRect,
  scrollToSummaryMatch,
  splitDomPos,
  traverseDomPosNode
} from './dom-match'
export type { DomPosNodeHit, NormalizedMatch, TextHitAtStrIdx, TextNodeHit } from './dom-match'

// navTarget 构造与页码解析
export {
  buildNavTargetFromBookmarkItem,
  buildNavTargetFromLineItem,
  buildNavTargetFromNoteItem,
  isDomPosNavTargetApplyReady,
  isDomPosOnlyNavTarget,
  isNavTargetPaginationReady,
  parseReadPositionSummary,
  resolveDomPosNavTargetPageIndex,
  resolveGoChapterInitialPageIndex,
  resolveHorizontalPageFromLineMark,
  resolvePageIndexFromNavTarget
} from './nav-target'
export type { NavTarget, ResolveDomPosNavTargetOptions, ResolvePageIndexOptions } from './nav-target'

// 阅读快照构造
export { buildReadPositionPayload, buildReadingSnapshot } from './snapshot-build'
export type { BuildReadPositionPayloadInput, BuildReadingSnapshotInput, ReadingSnapshot } from './snapshot-build'

// 滚动还原
export { applyNavTarget, scrollToDomPosTextPosition } from './snapshot-scroll'
export type { ApplyNavTargetInput, ScrollToDomPosTextPositionInput } from './snapshot-scroll'
