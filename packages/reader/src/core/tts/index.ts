/**
 * TTS 模块入口。
 *
 * 源码对照：old-vue-reader/utils/tts/* + store/tts-state.js + utils/tts-scroll.js +
 * utils/tts-segments.js + utils/tts/tts-confirm.js
 */

export { TTS_CONSTANT } from './constant'
export type { TtsConstant } from './constant'

export { generateUUID } from './uuid'

export {
  getTtsBackConfirm,
  getTtsPlayPosition,
  getTtsTimbreConfig,
  setTtsBackConfirm,
  setTtsPlayPosition,
  setTtsTimbreConfig
} from './storage'
export type { TtsPlayPosition } from './storage'

export { confirmTtsInterrupt, confirmTtsLeaveReader } from './confirm'

export {
  buildCharDomMap,
  buildChapterTextInfo,
  computeDomPosFromTextNode,
  formatTtsMilliseconds,
  isValidText,
  textJoin,
  textSplit
} from './text-process-core'
export type { CharDomEntry, TtsTextItem } from './text-process-core'

export {
  extractTtsSegments,
  extractTextWithUuidsFromDOM,
  filterTextByDomPos,
  processLiveTTSContent,
  processTTSContent
} from './text-process-extract'
export type { ProcessTtsContentResult } from './text-process-extract'

export {
  computeChapterPlayTime,
  judgeTtsInView,
  resolveSeekTimeForTextIndex,
  setReadDomPosition
} from './position'
export type {
  JudgeTtsInViewInput,
  SetReadDomPositionInput,
  TtsAudioInfo,
  TtsReadPosition
} from './position'

export {
  base64toBlob,
  getTTSAudioInfo,
  isAudioError,
  isAudioLoaded,
  isAudioPending
} from './audio-api'
export type { FetchTtsAudioRawFn, TtsAudioInfoResult, TtsAudioRawResponse } from './audio-api'

export { TtsReport } from './report'
export type { ReportTtsReadTimeFn } from './report'

export {
  buildTextNodeInView,
  getReadDomPositionFromSnapshot,
  getTtsReadDomPositionFromViewport,
  isTtsSegmentInView
} from './scroll'
export type { IsTtsSegmentInViewInput, TextNodeInViewItem, TtsReadDomPosition } from './scroll'

export {
  createTtsMutations,
  createTtsState,
  getVoiceLabel,
  MOCK_VOICES,
  syncTtsStateFromEngine
} from './state'
export type { TtsEngineState, TtsMutations, TtsState } from './state'

export { TtsEngine } from './engine'
export type { TtsAudioObjectEntry, TtsEngineOptions } from './engine'
