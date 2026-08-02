/**
 * core/ 纯函数引擎入口（零 React 依赖）。
 *
 * 详见 plans/00-总览与契约.md §2 与 plans/phase-01-引擎纯函数.md。
 */

export * from './pagination'
export * from './chapter-buffer'
export * from './selection'
export * from './highlights'
export * from './reading-position'
export * from './chapter-nav'
export * from './bookmark-match'
export * from './reader-viewport'
export * from './book-css'
export * from './content-interactions'
export * from './tts'
export { formatSecondToTime } from './format-time'
export {
  parseCheckReadAccess,
  parseNextChapterAccess
} from './chapter-access'
export type { CheckReadAccessResult, NextChapterAccessResult } from './chapter-access'
export { READER_LOGIN_MESSAGES } from './reader-auth'
export type { ReaderLoginMessageKey } from './reader-auth'
