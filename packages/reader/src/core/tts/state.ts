/**
 * TTS 播放状态（纯对象 + mutations，去 Vue.observable）。
 *
 * 源码对照：old-vue-reader/store/tts-state.js:1-277
 *
 * 重要：
 * - 源码 attachTtsState 用 Vue.observable 创建响应式 state，属 Vue 专属。本模块导出
 *   createTtsState / syncTtsStateFromEngine / createTtsMutations 为纯对象/函数，
 *   Phase 6 用 zustand 包装为响应式 store。
 * - MOCK_VOICES 源码注释明确「reader 不内置，仅参考结构」，此处仅导出结构供参考，
 *   实际音色列表由宿主通过 ttsVoiceTypes prop 注入（见 §5 Props）。
 */

import { formatSecondToTime } from '../format-time'
import { getTtsTimbreConfig } from './storage'

export const MOCK_VOICES = [
  { label: '儒雅青年', voiceType: 'BV102_streaming' },
  { label: '温柔女声', voiceType: 'BV104_streaming' },
  { label: '阳光青年', voiceType: 'BV123_streaming' },
  { label: '小萝莉', voiceType: 'BV064_streaming' },
  { label: '智慧老者', voiceType: 'BV158_streaming' },
  { label: '慈爱姥姥', voiceType: 'BV157_streaming' }
] as const

export interface TtsState {
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  timeoutMode: 'off' | 'end' | number
  timeoutRemaining: number
  voiceType: string
  segmentIndex: number
  segments: unknown[]
  textObjIndex: number
  textObjLength: number
  ttsCurrentDomPos: string
  ttsCurrentWordIndex: number
  ttsCurrentAudioIndex: number
  ttsCurrentPlayTime: number
  chapterDurationMs: number
  loading: boolean
  seeking: boolean
  timeoutTimer: ReturnType<typeof setInterval> | null
  sessionActive: boolean
  chapterId: number | null
  segmentInView: boolean
}

/** 创建 TTS 播放状态（纯对象，Phase 6 用 zustand 包装为响应式）。对齐 Vue tts-state.js:14 */
export function createTtsState(): TtsState {
  return {
    playing: false,
    currentTime: 0,
    duration: 0,
    speed: 1,
    timeoutMode: 'off',
    timeoutRemaining: 0,
    voiceType: getTtsTimbreConfig() || 'BV102_streaming',
    segmentIndex: 0,
    segments: [],
    textObjIndex: 0,
    textObjLength: 0,
    ttsCurrentDomPos: '',
    ttsCurrentWordIndex: 0,
    ttsCurrentAudioIndex: 0,
    ttsCurrentPlayTime: 0,
    chapterDurationMs: 0,
    loading: false,
    seeking: false,
    timeoutTimer: null,
    sessionActive: false,
    chapterId: null,
    segmentInView: false
  }
}

export interface TtsEngineState {
  playing?: boolean
  loading?: boolean
  chapterId?: number | null
  textObjIndex?: number
  textObjLength?: number
  currentTime?: number
  duration?: number
  ttsCurrentDomPos?: string | null
  ttsCurrentWordIndex?: number
  ttsCurrentAudioIndex?: number
  ttsCurrentPlayTime?: number
  chapterDurationMs?: number
}

/** 把引擎 emit 的状态同步到 ttsState（仅覆盖存在的字段）。对齐 Vue tts-state.js:42 */
export function syncTtsStateFromEngine(ttsState: TtsState, engineState: TtsEngineState = {}): void {
  if (typeof engineState.playing === 'boolean') {
    ttsState.playing = engineState.playing
  }
  if (typeof engineState.loading === 'boolean') {
    ttsState.loading = engineState.loading
  }
  if (engineState.chapterId !== null && engineState.chapterId !== undefined) {
    ttsState.chapterId = Number(engineState.chapterId)
  }
  if (typeof engineState.textObjIndex === 'number') {
    ttsState.textObjIndex = engineState.textObjIndex
    ttsState.segmentIndex = engineState.textObjIndex
  }
  if (typeof engineState.textObjLength === 'number') {
    ttsState.textObjLength = engineState.textObjLength
  }
  if (typeof engineState.currentTime === 'number') {
    ttsState.currentTime = engineState.currentTime
  }
  if (typeof engineState.duration === 'number') {
    ttsState.duration = engineState.duration
  }
  if (engineState.ttsCurrentDomPos !== null && engineState.ttsCurrentDomPos !== undefined) {
    ttsState.ttsCurrentDomPos = engineState.ttsCurrentDomPos
  }
  if (typeof engineState.ttsCurrentWordIndex === 'number') {
    ttsState.ttsCurrentWordIndex = engineState.ttsCurrentWordIndex
  }
  if (typeof engineState.ttsCurrentAudioIndex === 'number') {
    ttsState.ttsCurrentAudioIndex = engineState.ttsCurrentAudioIndex
  }
  if (typeof engineState.ttsCurrentPlayTime === 'number') {
    ttsState.ttsCurrentPlayTime = engineState.ttsCurrentPlayTime
  }
  if (typeof engineState.chapterDurationMs === 'number') {
    ttsState.chapterDurationMs = engineState.chapterDurationMs
  }
}

/** 由 voiceType 取音色标签（MOCK_VOICES 参考，实际音色由宿主 ttsVoiceTypes 注入）。对齐 Vue tts-state.js:82 */
export function getVoiceLabel(voiceType: string): string {
  const voice = MOCK_VOICES.find(item => item.voiceType === voiceType)
  return voice ? voice.label : MOCK_VOICES[0].label
}

function getTimeoutRemainingFormatted(ttsState: TtsState): string {
  if (ttsState.timeoutMode === 'off') {
    return ''
  }

  if (ttsState.timeoutMode === 'end') {
    const total = ttsState.duration || 0
    const current = ttsState.currentTime || 0
    const speed = ttsState.speed || 1
    const remain = Math.max(0, Math.ceil((total - current) / speed))

    return formatSecondToTime(remain)
  }

  if (!ttsState.timeoutRemaining) {
    return ''
  }

  return formatSecondToTime(ttsState.timeoutRemaining)
}

export interface TtsMutations {
  setTtsSpeed(speed: number): void
  setTtsPlaying(value: boolean): void
  toggleTtsPlaying(): void
  setTtsCurrentTime(time: number): void
  setTtsDuration(duration: number): void
  setTtsSeeking(value: boolean): void
  setTtsLoading(value: boolean): void
  setTtsVoiceType(voiceType: string): void
  setTtsSegmentIndex(index: number): void
  setTtsSegments(segments: unknown[]): void
  clearTtsTimeout(): void
  setTtsTimeoutMode(rawMode: 'off' | 'end' | 'lecture' | number): void
  handleTtsTrackEnded(engine?: { pauseAudio(): void; playNextAudio(): void } | null): void
  resetTtsPlayback(): void
  startTtsSession(chapterId: number): void
  setTtsSegmentInView(value: boolean): void
  stopTtsSession(): void
  destroyTts(): void
  getTtsTimeoutRemainingFormatted(): string
}

/** 创建 TTS mutations（播放/进度/音色/段索引/定时模式/会话 等操作集）。对齐 Vue tts-state.js:108 */
export function createTtsMutations(ttsState: TtsState): TtsMutations {
  function clearTimeoutTimer(): void {
    if (ttsState.timeoutTimer) {
      clearInterval(ttsState.timeoutTimer)
      ttsState.timeoutTimer = null
    }
  }

  const mutations: TtsMutations = {
    setTtsSpeed(speed) {
      ttsState.speed = Number(speed) || 1
    },

    setTtsPlaying(value) {
      ttsState.playing = Boolean(value)
    },

    toggleTtsPlaying() {
      ttsState.playing = !ttsState.playing
    },

    setTtsCurrentTime(time) {
      ttsState.currentTime = Math.max(0, Number(time) || 0)
    },

    setTtsDuration(duration) {
      ttsState.duration = Math.max(0, Number(duration) || 0)
    },

    setTtsSeeking(value) {
      ttsState.seeking = Boolean(value)
    },

    setTtsLoading(value) {
      ttsState.loading = Boolean(value)
    },

    setTtsVoiceType(voiceType) {
      ttsState.voiceType = voiceType || 'BV102_streaming'
    },

    setTtsSegmentIndex(index) {
      const max = Math.max(0, ttsState.segments.length - 1)
      ttsState.segmentIndex = Math.min(max, Math.max(0, Number(index) || 0))
    },

    setTtsSegments(segments) {
      ttsState.segments = Array.isArray(segments) ? segments : []
      if (ttsState.segmentIndex >= ttsState.segments.length) {
        ttsState.segmentIndex = 0
      }
    },

    clearTtsTimeout() {
      mutations.setTtsTimeoutMode('off')
    },

    setTtsTimeoutMode(rawMode: 'off' | 'end' | 'lecture' | number): void {
      let mode: 'off' | 'end' | number = rawMode as 'off' | 'end' | number

      if ((rawMode as string) === 'lecture') {
        mode = 'end'
      }

      ttsState.timeoutMode = mode || 'off'
      clearTimeoutTimer()

      if (mode === 'off') {
        ttsState.timeoutRemaining = 0
        return
      }

      if (mode === 'end') {
        ttsState.timeoutRemaining = 0
        return
      }

      const minutes = Number(mode)

      if (!minutes) {
        return
      }

      ttsState.timeoutMode = minutes
      ttsState.timeoutRemaining = minutes * 60
      ttsState.timeoutTimer = setInterval(() => {
        if (ttsState.timeoutRemaining <= 1) {
          clearTimeoutTimer()
          mutations.setTtsPlaying(false)
          mutations.setTtsTimeoutMode('off')
          return
        }

        ttsState.timeoutRemaining -= 1
      }, 1000)
    },

    handleTtsTrackEnded(engine) {
      if (ttsState.timeoutMode === 'end') {
        mutations.setTtsPlaying(false)
        mutations.setTtsTimeoutMode('off')
        if (engine) {
          engine.pauseAudio()
        }
        return
      }

      if (engine) {
        engine.playNextAudio()
        return
      }

      mutations.setTtsPlaying(false)
    },

    resetTtsPlayback() {
      mutations.setTtsPlaying(false)
      mutations.setTtsCurrentTime(0)
      mutations.setTtsDuration(0)
      mutations.setTtsSeeking(false)
      mutations.setTtsLoading(false)
    },

    startTtsSession(chapterId) {
      ttsState.sessionActive = true
      ttsState.chapterId = Number(chapterId) || null
      ttsState.segmentInView = false
    },

    setTtsSegmentInView(value) {
      ttsState.segmentInView = Boolean(value)
    },

    stopTtsSession() {
      clearTimeoutTimer()
      ttsState.sessionActive = false
      ttsState.chapterId = null
      ttsState.segmentInView = true
      ttsState.segments = []
      ttsState.segmentIndex = 0
      mutations.resetTtsPlayback()
      mutations.setTtsTimeoutMode('off')
    },

    destroyTts() {
      mutations.stopTtsSession()
    },

    getTtsTimeoutRemainingFormatted() {
      // 触发依赖读取（zustand 下由 selector 处理）
      void ttsState.currentTime
      void ttsState.timeoutRemaining
      void ttsState.duration
      void ttsState.speed
      return getTimeoutRemainingFormatted(ttsState)
    }
  }

  return mutations
}
