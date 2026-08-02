/** API 入口 — USE_MOCK 开关（默认 true）+ re-exports */

export const USE_MOCK =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_MOCK === 'false'
    ? false
    : true

export * from './chapter'
export * from './line'
export * from './note'
export * from './bookmark'
export * from './tts'
export * from './tts-report'
export * from './reading-position'
export * from './thought'
export * from './debug-config'
