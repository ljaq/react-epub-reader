/**
 * TTS 播放态 store — zustand 包装 core/tts/state 纯对象。
 *
 * 源码对照：old-vue-reader/store/tts-state.js + reader-context.js TTS 桥接。
 */
import { create } from 'zustand'
import { formatSecondToTime } from '../core/format-time'
import { getTtsTimbreConfig } from '../core/tts/storage'
import { syncTtsStateFromEngine, type TtsEngineState } from '../core/tts/state'
import type { TtsEngine } from '../core/tts/engine'
import type { TextNodeInViewItem } from '../core/tts/scroll'
import type { TtsVoiceType } from '../types'

export type TtsTimeoutMode = 'off' | 'end' | number

export interface TtsStoreState {
  playing: boolean
  currentTime: number
  duration: number
  speed: number
  timeoutMode: TtsTimeoutMode
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
  sessionActive: boolean
  chapterId: number | null
  segmentInView: boolean
  ttsTextNodeInView: TextNodeInViewItem[]
  voiceTypes: TtsVoiceType[]

  engine: TtsEngine | null
  timeoutTimer: ReturnType<typeof setInterval> | null

  setEngine: (engine: TtsEngine | null) => void
  syncFromEngine: (engineState: TtsEngineState) => void
  setVoiceTypes: (voices: TtsVoiceType[]) => void
  setTtsTextNodeInView: (items: TextNodeInViewItem[]) => void

  setTtsSpeed: (speed: number) => void
  setTtsPlaying: (value: boolean) => void
  toggleTtsPlaying: () => void
  setTtsCurrentTime: (time: number) => void
  setTtsDuration: (duration: number) => void
  setTtsSeeking: (value: boolean) => void
  setTtsLoading: (value: boolean) => void
  setTtsVoiceType: (voiceType: string) => void
  setTtsSegmentIndex: (index: number) => void
  setTtsSegments: (segments: unknown[]) => void
  clearTtsTimeout: () => void
  setTtsTimeoutMode: (rawMode: 'off' | 'end' | 'lecture' | number) => void
  handleTtsTrackEnded: () => void
  resetTtsPlayback: () => void
  startTtsSession: (chapterId: number) => void
  setTtsSegmentInView: (value: boolean) => void
  stopTtsSession: () => void
  destroyTts: () => void
  getTtsTimeoutRemainingFormatted: () => string
  getVoiceLabel: (voiceType?: string) => string
}

function getTimeoutRemainingFormatted(state: Pick<TtsStoreState, 'timeoutMode' | 'timeoutRemaining' | 'duration' | 'currentTime' | 'speed'>): string {
  if (state.timeoutMode === 'off') {
    return ''
  }
  if (state.timeoutMode === 'end') {
    const total = state.duration || 0
    const current = state.currentTime || 0
    const speed = state.speed || 1
    const remain = Math.max(0, Math.ceil((total - current) / speed))
    return formatSecondToTime(remain)
  }
  if (!state.timeoutRemaining) {
    return ''
  }
  return formatSecondToTime(state.timeoutRemaining)
}

function clearTimeoutTimer(state: TtsStoreState): void {
  if (state.timeoutTimer) {
    clearInterval(state.timeoutTimer)
  }
}

export const useTtsStore = create<TtsStoreState>((set, get) => ({
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
  sessionActive: false,
  chapterId: null,
  segmentInView: false,
  ttsTextNodeInView: [],
  voiceTypes: [],

  engine: null,
  timeoutTimer: null,

  setEngine: (engine) => set({ engine }),

  syncFromEngine: (engineState) => {
    set((s) => {
      const draft = { ...s }
      syncTtsStateFromEngine(draft as never, engineState)
      return {
        playing: draft.playing,
        loading: draft.loading,
        chapterId: draft.chapterId,
        textObjIndex: draft.textObjIndex,
        textObjLength: draft.textObjLength,
        segmentIndex: draft.segmentIndex,
        currentTime: draft.currentTime,
        duration: draft.duration,
        ttsCurrentDomPos: draft.ttsCurrentDomPos,
        ttsCurrentWordIndex: draft.ttsCurrentWordIndex,
        ttsCurrentAudioIndex: draft.ttsCurrentAudioIndex,
        ttsCurrentPlayTime: draft.ttsCurrentPlayTime,
        chapterDurationMs: draft.chapterDurationMs
      }
    })
  },

  setVoiceTypes: (voices) => set({ voiceTypes: voices }),

  setTtsTextNodeInView: (items) => set({ ttsTextNodeInView: items }),

  setTtsSpeed: (speed) => {
    const value = Number(speed) || 1
    set({ speed: value })
    get().engine?.setPlaybackRate(value)
  },

  setTtsPlaying: (value) => {
    const playing = Boolean(value)
    set({ playing })
    const engine = get().engine
    if (!engine) return
    if (playing) {
      void engine.playAudio()
    } else {
      engine.pauseAudio()
    }
  },

  toggleTtsPlaying: () => {
    const { playing, setTtsPlaying } = get()
    setTtsPlaying(!playing)
  },

  setTtsCurrentTime: (time) => set({ currentTime: Math.max(0, Number(time) || 0) }),

  setTtsDuration: (duration) => set({ duration: Math.max(0, Number(duration) || 0) }),

  setTtsSeeking: (value) => set({ seeking: Boolean(value) }),

  setTtsLoading: (value) => set({ loading: Boolean(value) }),

  setTtsVoiceType: (voiceType) => {
    const next = voiceType || 'BV102_streaming'
    set({ voiceType: next })
    void get().engine?.changeTimbre(next)
  },

  setTtsSegmentIndex: (index) => {
    const max = Math.max(0, get().segments.length - 1)
    set({ segmentIndex: Math.min(max, Math.max(0, Number(index) || 0)) })
  },

  setTtsSegments: (segments) => {
    const list = Array.isArray(segments) ? segments : []
    set((s) => ({
      segments: list,
      segmentIndex: s.segmentIndex >= list.length ? 0 : s.segmentIndex
    }))
  },

  clearTtsTimeout: () => {
    get().setTtsTimeoutMode('off')
  },

  setTtsTimeoutMode: (rawMode) => {
    let mode: TtsTimeoutMode = rawMode as TtsTimeoutMode
    if (rawMode === 'lecture') {
      mode = 'end'
    }

    const state = get()
    clearTimeoutTimer(state)
    set({ timeoutMode: mode || 'off', timeoutTimer: null })

    if (mode === 'off') {
      set({ timeoutRemaining: 0 })
      return
    }
    if (mode === 'end') {
      set({ timeoutRemaining: 0 })
      return
    }

    const minutes = Number(mode)
    if (!minutes) return

    set({
      timeoutMode: minutes,
      timeoutRemaining: minutes * 60,
      timeoutTimer: setInterval(() => {
        const s = get()
        if (s.timeoutRemaining <= 1) {
          clearTimeoutTimer(s)
          get().setTtsPlaying(false)
          get().setTtsTimeoutMode('off')
          return
        }
        set({ timeoutRemaining: s.timeoutRemaining - 1 })
      }, 1000)
    })
  },

  handleTtsTrackEnded: () => {
    const { timeoutMode, engine, setTtsPlaying, setTtsTimeoutMode } = get()
    if (timeoutMode === 'end') {
      setTtsPlaying(false)
      setTtsTimeoutMode('off')
      engine?.pauseAudio()
      return
    }
    if (engine) {
      void engine.playNextAudio()
      return
    }
    setTtsPlaying(false)
  },

  resetTtsPlayback: () => {
    set({
      playing: false,
      currentTime: 0,
      duration: 0,
      seeking: false,
      loading: false
    })
  },

  startTtsSession: (chapterId) => {
    set({
      sessionActive: true,
      chapterId: Number(chapterId) || null,
      segmentInView: false
    })
  },

  setTtsSegmentInView: (value) => set({ segmentInView: Boolean(value) }),

  stopTtsSession: () => {
    const state = get()
    clearTimeoutTimer(state)
    set({
      timeoutTimer: null,
      sessionActive: false,
      chapterId: null,
      segmentInView: true,
      segments: [],
      segmentIndex: 0,
      playing: false,
      currentTime: 0,
      duration: 0,
      seeking: false,
      loading: false,
      timeoutMode: 'off',
      timeoutRemaining: 0
    })
  },

  destroyTts: () => {
    get().stopTtsSession()
  },

  getTtsTimeoutRemainingFormatted: () => getTimeoutRemainingFormatted(get()),

  getVoiceLabel: (voiceType) => {
    const key = voiceType || get().voiceType
    const voices = get().voiceTypes
    const found = voices.find((v) => v.key === key)
    return found?.label || voices[0]?.label || '默认音色'
  }
}))

/** 是否 TTS 正在活跃播放（对齐 Vue isTtsActivelyPlaying）。 */
export function isTtsActivelyPlaying(): boolean {
  const { playing, engine } = useTtsStore.getState()
  if (playing) return true
  const player = engine?.audioPlayer
  return Boolean(player && !player.paused)
}
