/**
 * TTS 引擎生命周期 — 构造 TtsEngine、绑定 audio、同步 store。
 */
import { useEffect, useRef, type RefObject } from 'react'
import { TtsEngine } from '../core/tts/engine'
import { getTtsReadDomPositionFromViewport } from '../core/tts/scroll'
import { useTtsStore } from '../store/tts-store'
import { useReadingStore } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'
import { useReaderDomStore } from '../store/reader-dom-store'
import { useUiStore } from '../store/ui-store'
import { createFetchTtsAudioRaw, clearPendingTtsAudioRequests } from './useTtsAudioBridge'
import type { ChapterContent } from '../types'

export interface UseTtsEngineOptions {
  bookId: number
  chapters: Record<number, ChapterContent>
  chapterListLength: number
  isLoggedIn: boolean
  onTtsAudioRequest?: (req: {
    reqId: string
    text: string
    voiceType: string
    chapterId: number
  }) => void
  onTtsReadTimeReport?: (payload: { bookId: number; chapterId: number; seconds: number }) => void
}

export function useTtsEngine(options: UseTtsEngineOptions): {
  audioRef: RefObject<HTMLAudioElement | null>
} {
  const {
    bookId,
    chapters,
    chapterListLength,
    isLoggedIn,
    onTtsAudioRequest,
    onTtsReadTimeReport
  } = options

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const engineRef = useRef<TtsEngine | null>(null)
  const chaptersRef = useRef(chapters)
  chaptersRef.current = chapters

  const setEngine = useTtsStore((s) => s.setEngine)
  const syncFromEngine = useTtsStore((s) => s.syncFromEngine)
  const startTtsSession = useTtsStore((s) => s.startTtsSession)
  const handleTtsTrackEnded = useTtsStore((s) => s.handleTtsTrackEnded)
  const voiceType = useTtsStore((s) => s.voiceType)
  const speed = useTtsStore((s) => s.speed)

  useEffect(() => {
    const fetchTtsAudioRaw = createFetchTtsAudioRaw(onTtsAudioRequest)

    const engine = new TtsEngine({
      bookId,
      getMaxChapterId: () => chapterListLength,
      fetchChapterHtml: async (chapterId) => {
        const chapter = chaptersRef.current[chapterId]
        if (!chapter) {
          return { code: -1 }
        }
        return { code: 0, html: chapter.html }
      },
      getReadDomPosition: () => {
        const chapterId = useReadingStore.getState().chapterId
        const bodyEl = useReaderDomStore.getState().getBodyForChapter(chapterId)
        const viewportEl = useReaderDomStore.getState().getViewportEl()
        const horizontal = useSettingsStore.getState().horizontalEnabled
        return getTtsReadDomPositionFromViewport({ bodyEl, viewportEl, horizontal })
      },
      getReadRootElement: () => {
        const chapterId = useReadingStore.getState().chapterId
        return useReaderDomStore.getState().getBodyForChapter(chapterId)
      },
      onStateChange: (state) => {
        syncFromEngine(state)
      },
      onChapterChange: (chapterId) => {
        startTtsSession(chapterId)
      },
      onAlert: (msg) => {
        window.alert(msg)
      },
      onToast: (text) => {
        useUiStore.getState().showToast(text)
      },
      isLoggedIn: () => isLoggedIn,
      fetchTtsAudioRaw,
      reportReadTime: ({ bookId: bid, chapterId, intervalMinute }) => {
        onTtsReadTimeReport?.({ bookId: bid, chapterId, seconds: intervalMinute * 60 })
      }
    })

    engine.setVoiceType(voiceType)
    engine.setPlaybackRate(speed)

    if (audioRef.current) {
      engine.bindAudio(audioRef.current)
    }

    engineRef.current = engine
    setEngine(engine)

    return () => {
      engine.destroy()
      engineRef.current = null
      setEngine(null)
      clearPendingTtsAudioRequests()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterListLength, isLoggedIn])

  useEffect(() => {
    const audio = audioRef.current
    const engine = engineRef.current
    if (!audio || !engine) return

    engine.bindAudio(audio)

    const onEnded = () => {
      handleTtsTrackEnded()
    }
    const onTimeUpdate = () => {
      useTtsStore.getState().setTtsCurrentTime(audio.currentTime)
      useTtsStore.getState().setTtsDuration(audio.duration || 0)
    }

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [handleTtsTrackEnded])

  useEffect(() => {
    engineRef.current?.setPlaybackRate(speed)
  }, [speed])

  return { audioRef }
}
