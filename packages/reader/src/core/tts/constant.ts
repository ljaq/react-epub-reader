/**
 * TTS 常量。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-constant.js:1-32
 */

export const TTS_CONSTANT = {
  TTS_TEXT_SPLIT_TYPE: {
    UNSPLICED: 1,
    UNSPLICED_TEXT: '未拆分的',
    SPLICED: 2,
    SPLICED_TEXT: '拆分的',
    SPLICED_BY_AFTER: 3,
    SPLICED_BY_AFTER_TEXT: '被后方追加的',
    SPLICED_SPLICED_BY_AFTER: 4,
    SPLICED_SPLICED_BY_AFTER_TEXT: '拆分后被后方追加的'
  },
  API: {
    TTS_AUDIO_URL: '/audio/tts'
  },
  TEXT_RANGE: [20, 60] as const,
  AUDIO_CACHES_NUMBER: 5,
  TTS_TEXT_TIME_DURATION: 160,
  TTS_TIMBRE_CONFIG: 'BV102_streaming',
  TTS_REPORT_INTERVAL: 60 * 1000,
  SKIP_TIME_SECONDS: 15,
  MAX_AUDIO_WAIT_ATTEMPTS: 5,
  TIMEOUT: {
    AJAX: 10000,
    SHORT: 5000
  },
  IGNORE_CHARS: ['\n', '\t', '\r', '\u200B', '\u200C', '\u200D', '\uFEFF']
} as const

export type TtsConstant = typeof TTS_CONSTANT
export default TTS_CONSTANT
