/**
 * 计算 TTS 播放段是否在视口（供 session 编排同步调用）。
 */
import { buildTextNodeInView, isTtsSegmentInView } from '../core/tts/scroll'
import { useTtsStore } from '../store/tts-store'
import { useReadingStore } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'
import { useReaderDomStore } from '../store/reader-dom-store'

export function computeTtsPlaybackInView(): boolean {
  const chapterId = useTtsStore.getState().chapterId ?? useReadingStore.getState().chapterId
  const bodyEl = useReaderDomStore.getState().getBodyForChapter(chapterId)
  const viewportEl = useReaderDomStore.getState().getViewportEl()
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
  return inView
}
