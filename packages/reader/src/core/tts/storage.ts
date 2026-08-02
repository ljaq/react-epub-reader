/**
 * TTS 本地存储（音色配置、播放位置、返回确认）。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-storage.js:1-57
 *
 * 注意：直接读写 localStorage，jsdom 下可测。reader 不内置音色列表
 * （MOCK_VOICES 仅参考结构，见 state.ts）。
 */

const STORAGE_PREFIX = 'reader_tts_'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) {
      return fallback
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value))
  } catch {
    // ignore quota errors
  }
}

export interface TtsPlayPosition {
  ttsBookId?: number
  [key: string]: unknown
}

/** 取书 TTS 播放位置（按 bookId 索引 localStorage）。对齐 Vue tts-storage.js:26 */
export function getTtsPlayPosition(bookId: number | string): TtsPlayPosition | null {
  const map = readJson<Record<string, TtsPlayPosition>>('tts_play_position', {})
  return map[bookId] || null
}

/** 存书 TTS 播放位置（带 ttsBookId）。对齐 Vue tts-storage.js:31 */
export function setTtsPlayPosition(bookId: number | string, location: TtsPlayPosition): void {
  if (!bookId || !location) {
    return
  }
  const map = readJson<Record<string, TtsPlayPosition>>('tts_play_position', {})
  map[bookId] = { ...location, ttsBookId: Number(bookId) }
  writeJson('tts_play_position', map)
}

/** 取/存 TTS 音色配置（localStorage）。对齐 Vue tts-storage.js:43,47 */
export function getTtsTimbreConfig(): string | null {
  return readJson<string | null>('tts_timbre_config', null)
}

export function setTtsTimbreConfig(voiceType: string): void {
  writeJson('tts_timbre_config', voiceType)
}

/** 取/存「退出不再提示」开关。对齐 Vue tts-storage.js:51,55 */
export function getTtsBackConfirm(): boolean {
  return readJson<boolean>('tts_back_confirm', false)
}

export function setTtsBackConfirm(value: boolean): void {
  writeJson('tts_back_confirm', Boolean(value))
}
