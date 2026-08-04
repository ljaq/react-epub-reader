/** API 入口 — USE_MOCK 开关（默认 true，可 localStorage 覆盖）+ re-exports */

const USE_MOCK_STORAGE_KEY = 'h5-demo:use-mock'

function resolveUseMock(): boolean {
  try {
    const stored = localStorage.getItem(USE_MOCK_STORAGE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    // ignore quota / private mode
  }
  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_MOCK === 'false'
    ? false
    : true
}

export const USE_MOCK = resolveUseMock()

export function setUseMock(value: boolean): void {
  try {
    localStorage.setItem(USE_MOCK_STORAGE_KEY, String(value))
  } catch {
    // ignore
  }
  window.location.reload()
}

export * from './chapter'
export * from './line'
export * from './note'
export * from './bookmark'
export * from './tts'
export * from './tts-report'
export * from './reading-position'
export * from './thought'
export * from './debug-config'
