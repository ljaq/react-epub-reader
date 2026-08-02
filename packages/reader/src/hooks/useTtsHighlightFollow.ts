/**
 * TTS 高亮跟随与 ReturnBar 滚动 — 编排 core/tts/scroll 纯函数。
 *
 * 源码对照：old-vue-reader/utils/tts-scroll.js
 */
import { useCallback, useEffect, useRef } from 'react'
import {
  buildTextNodeInView,
  HORIZONTAL_TRANSITION_MS,
  isTtsSegmentInView
} from '../core/tts/scroll'
import { useTtsStore } from '../store/tts-store'
import { useReadingStore } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'
import { useReaderDomStore } from '../store/reader-dom-store'
import { navigateToNavTarget } from './useNavigateToNavTarget'

const VISIBILITY_DEBOUNCE_MS = 300

function splitDomPos(domPos: string): { domPosBase: string; textIdx: number } {
  const [base = '', charIdx = '0'] = String(domPos || '').split('#')
  return { domPosBase: base, textIdx: Number(charIdx) || 0 }
}

export function useTtsHighlightFollow(): {
  updateTtsSegmentVisibility: () => void
  scrollToTtsSegment: () => Promise<boolean>
  isTtsPlaybackInView: () => boolean
} {
  const sessionActive = useTtsStore((s) => s.sessionActive)
  const ttsChapterId = useTtsStore((s) => s.chapterId)
  const ttsCurrentDomPos = useTtsStore((s) => s.ttsCurrentDomPos)
  const ttsCurrentWordIndex = useTtsStore((s) => s.ttsCurrentWordIndex)
  const readChapterId = useReadingStore((s) => s.chapterId)
  const horizontalEnabled = useSettingsStore((s) => s.horizontalEnabled)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getDomElements = useCallback(() => {
    const chapterId = useTtsStore.getState().chapterId ?? useReadingStore.getState().chapterId
    const bodyEl = useReaderDomStore.getState().getBodyForChapter(chapterId)
    const viewportEl = useReaderDomStore.getState().getViewportEl()
    return { bodyEl, viewportEl, chapterId }
  }, [])

  const updateTtsSegmentVisibility = useCallback(() => {
    const { bodyEl, viewportEl, chapterId } = getDomElements()
    const horizontal = useSettingsStore.getState().horizontalEnabled
    const textNodeInView = buildTextNodeInView({ bodyEl, viewportEl, horizontal })
    useTtsStore.getState().setTtsTextNodeInView(textNodeInView)

    const state = useTtsStore.getState()
    const inView = isTtsSegmentInView({
      chapterId: Number(chapterId),
      state: { chapterId: state.chapterId, ttsTextNodeInView: textNodeInView },
      domPos: state.ttsCurrentDomPos,
      wordIndex: state.ttsCurrentWordIndex
    })
    useTtsStore.getState().setTtsSegmentInView(inView)
  }, [getDomElements])

  const isTtsPlaybackInView = useCallback((): boolean => {
    if (useTtsStore.getState().sessionActive) {
      updateTtsSegmentVisibility()
    } else {
      const { bodyEl, viewportEl } = getDomElements()
      const horizontal = useSettingsStore.getState().horizontalEnabled
      const textNodeInView = buildTextNodeInView({ bodyEl, viewportEl, horizontal })
      useTtsStore.getState().setTtsTextNodeInView(textNodeInView)
    }
    return useTtsStore.getState().segmentInView
  }, [getDomElements, updateTtsSegmentVisibility])

  const scrollToTtsSegment = useCallback(async (): Promise<boolean> => {
    const state = useTtsStore.getState()
    const chapterId = state.chapterId
    const domPos = state.ttsCurrentDomPos
    const wordIndex = state.ttsCurrentWordIndex
    if (!chapterId || !domPos) return false

    const { domPosBase, textIdx } = splitDomPos(domPos)
    const targetTextIdx = Number.isFinite(wordIndex) ? wordIndex : textIdx

    navigateToNavTarget(Number(chapterId), {
      chapterId: Number(chapterId),
      domPos: `${domPosBase}#${targetTextIdx}`,
      textIdx: targetTextIdx
    })

    const horizontal = useSettingsStore.getState().horizontalEnabled
    if (horizontal) {
      await new Promise((r) => setTimeout(r, HORIZONTAL_TRANSITION_MS))
    }

    updateTtsSegmentVisibility()

    if (!useTtsStore.getState().segmentInView) {
      navigateToNavTarget(Number(chapterId), {
        chapterId: Number(chapterId),
        domPos: `${domPosBase}#${targetTextIdx}`,
        textIdx: targetTextIdx
      })
      if (horizontal) {
        await new Promise((r) => setTimeout(r, HORIZONTAL_TRANSITION_MS))
      }
      updateTtsSegmentVisibility()
    }

    return useTtsStore.getState().segmentInView
  }, [updateTtsSegmentVisibility])

  const scheduleVisibilityCheck = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      updateTtsSegmentVisibility()
    }, VISIBILITY_DEBOUNCE_MS)
  }, [updateTtsSegmentVisibility])

  useEffect(() => {
    if (!sessionActive) return
    scheduleVisibilityCheck()
  }, [
    sessionActive,
    ttsChapterId,
    ttsCurrentDomPos,
    ttsCurrentWordIndex,
    readChapterId,
    horizontalEnabled,
    scheduleVisibilityCheck
  ])

  useEffect(() => {
    if (!sessionActive || horizontalEnabled) return
    const scrollRoot = useReaderDomStore.getState().getScrollRoot()
    if (!scrollRoot) return

    const handler = () => scheduleVisibilityCheck()
    scrollRoot.addEventListener('scroll', handler, { passive: true })
    return () => scrollRoot.removeEventListener('scroll', handler)
  }, [sessionActive, horizontalEnabled, scheduleVisibilityCheck])

  return { updateTtsSegmentVisibility, scrollToTtsSegment, isTtsPlaybackInView }
}
