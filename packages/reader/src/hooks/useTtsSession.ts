/**
 * TTS 会话编排 — openTtsPopup / startTtsPlayback / stopTtsSession / goTtsChapter。
 *
 * 源码对照：old-vue-reader/store/reader-context.js
 */
import { useCallback } from 'react'
import { confirmTtsPlayPosition } from '../components/popups/tts/confirmTtsPlayPosition'
import { computeTtsPlaybackInView } from './computeTtsPlaybackInView'
import { useTtsStore, isTtsActivelyPlaying } from '../store/tts-store'
import { useUiStore } from '../store/ui-store'
import { useReadingStore } from '../store/reading-store'
import { useReaderDomStore } from '../store/reader-dom-store'
import type { ChapterContent } from '../types'

function syncTtsSessionAfterStart(chapterId: number): void {
  const engine = useTtsStore.getState().engine
  if (!engine) return
  const textList = engine.ttsTextObject[chapterId] || []
  useTtsStore.getState().startTtsSession(chapterId)
  useTtsStore.getState().setTtsSegments(textList)
}

async function resolveTtsPlaybackStartMode(): Promise<{ fromReadPosition: boolean; aborted?: boolean }> {
  const state = useTtsStore.getState()
  if (!state.ttsCurrentDomPos) {
    return { fromReadPosition: true }
  }
  if (computeTtsPlaybackInView()) {
    return { fromReadPosition: false }
  }
  const choice = await confirmTtsPlayPosition()
  if (choice === null) {
    return { fromReadPosition: true, aborted: true }
  }
  return { fromReadPosition: choice === true }
}

export function useTtsSession(chapters: Record<number, ChapterContent>): {
  openTtsPopup: () => Promise<void>
  startTtsPlayback: () => Promise<boolean>
  stopTtsSession: () => void
  goTtsChapter: (chapterId: number) => Promise<void>
  ttsPrevChapter: () => Promise<void>
  ttsNextChapter: () => Promise<void>
  ttsSeekBackward: () => void
  ttsSeekForward: () => void
} {
  const openPopup = useUiStore((s) => s.openPopup)
  const closePopup = useUiStore((s) => s.closePopup)

  const stopTtsSession = useCallback(() => {
    const engine = useTtsStore.getState().engine
    engine?.clearTTSPlayingState()
    if (engine?.audioPlayer) {
      engine.audioPlayer.src = ''
      engine.audioPlayer.removeAttribute('src')
    }
    useTtsStore.getState().stopTtsSession()
  }, [])

  const startTtsPlayback = useCallback(async (): Promise<boolean> => {
    const engine = useTtsStore.getState().engine
    if (!engine) return false

    if (engine.audioPlayer?.src) {
      useTtsStore.getState().toggleTtsPlaying()
      return true
    }

    const readChapterId = useReadingStore.getState().chapterId
    const chapter = chapters[readChapterId]
    if (!chapter) return false

    const bodyEl = useReaderDomStore.getState().getBodyForChapter(readChapterId)
    const mode = await resolveTtsPlaybackStartMode()
    if (mode.aborted) return false

    let ok = false
    if (mode.fromReadPosition) {
      ok = await engine.startFromCurrentRead(readChapterId, chapter.html, bodyEl, { autoPlay: true })
    } else {
      ok = await engine.startFromPlaybackPosition(readChapterId, chapter.html, { autoPlay: true, liveBodyEl: bodyEl })
    }

    if (ok) {
      syncTtsSessionAfterStart(readChapterId)
    }
    return ok
  }, [chapters])

  const openTtsPopup = useCallback(async (): Promise<void> => {
    const popups = useUiStore.getState().popups
    if (popups.tts) {
      closePopup('tts')
      return
    }

    if (!isTtsActivelyPlaying()) {
      openPopup('tts')
      return
    }

    const inView = computeTtsPlaybackInView()
    if (inView) {
      openPopup('tts')
      return
    }

    const choice = await confirmTtsPlayPosition()
    const engine = useTtsStore.getState().engine
    const readChapterId = useReadingStore.getState().chapterId
    const chapter = chapters[readChapterId]

    if (choice === true && engine && chapter) {
      engine.pauseAudio()
      const bodyEl = useReaderDomStore.getState().getBodyForChapter(readChapterId)
      const ok = await engine.startFromCurrentRead(readChapterId, chapter.html, bodyEl, { autoPlay: true })
      if (ok) {
        syncTtsSessionAfterStart(readChapterId)
      }
    } else if (choice === false && engine?.audioPlayer?.paused) {
      void engine.playAudio()
    }

    openPopup('tts')
  }, [chapters, closePopup, openPopup])

  const goTtsChapter = useCallback(async (chapterId: number): Promise<void> => {
    const engine = useTtsStore.getState().engine
    if (!engine) return
    const targetId = Number(chapterId)
    useTtsStore.getState().startTtsSession(targetId)
    await engine.playAudioByChapterId(targetId, '', -1)
  }, [])

  const ttsPrevChapter = useCallback(async (): Promise<void> => {
    const engine = useTtsStore.getState().engine
    const currentId = useTtsStore.getState().chapterId
    if (!engine || !currentId || currentId <= 1) return
    await goTtsChapter(currentId - 1)
  }, [goTtsChapter])

  const ttsNextChapter = useCallback(async (): Promise<void> => {
    const engine = useTtsStore.getState().engine
    const currentId = useTtsStore.getState().chapterId
    if (!engine || !currentId) return
    await goTtsChapter(currentId + 1)
  }, [goTtsChapter])

  const ttsSeekBackward = useCallback(() => {
    void useTtsStore.getState().engine?.seekBackward()
  }, [])

  const ttsSeekForward = useCallback(() => {
    void useTtsStore.getState().engine?.seekForward()
  }, [])

  return {
    openTtsPopup,
    startTtsPlayback,
    stopTtsSession,
    goTtsChapter,
    ttsPrevChapter,
    ttsNextChapter,
    ttsSeekBackward,
    ttsSeekForward
  }
}

/** 供非 hook 上下文调用的 stopTtsSession（SettingsPanel / TopBar）。 */
export function stopTtsSessionGlobal(): void {
  const engine = useTtsStore.getState().engine
  engine?.clearTTSPlayingState()
  if (engine?.audioPlayer) {
    engine.audioPlayer.src = ''
    engine.audioPlayer.removeAttribute('src')
  }
  useTtsStore.getState().stopTtsSession()
}

/** 供 ToolBar 调用的 openTtsPopup 入口（需登录检查在外层）。 */
export { isTtsActivelyPlaying }
