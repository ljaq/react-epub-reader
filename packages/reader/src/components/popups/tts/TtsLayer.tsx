/**
 * TTS 层 — 挂载引擎 hooks + 全套 UI 组件。
 */
import { useEffect } from 'react'
import type { BookMeta, ChapterMeta, ChapterContent, TtsAudioEntry, TtsVoiceType } from '../../../types'
import { useTtsAudioBridge } from '../../../hooks/useTtsAudioBridge'
import { useTtsEngine } from '../../../hooks/useTtsEngine'
import { useTtsHighlightFollow } from '../../../hooks/useTtsHighlightFollow'
import { useTtsSession } from '../../../hooks/useTtsSession'
import { useTtsStore } from '../../../store/tts-store'
import { useUiStore } from '../../../store/ui-store'
import { registerTtsSessionActions, unregisterTtsSessionActions } from './tts-actions'
import { TtsPopup } from './TtsPopup'
import { TtsReturnBar } from './TtsReturnBar'

export interface TtsLayerProps {
  bookId: number
  bookMeta: BookMeta
  chapterList: ChapterMeta[]
  chapters: Record<number, ChapterContent>
  ttsVoiceTypes: TtsVoiceType[]
  ttsAudioUrl?: TtsAudioEntry | null
  isLoggedIn: boolean
  onTtsAudioRequest?: (req: {
    reqId: string
    text: string
    voiceType: string
    chapterId: number
  }) => void
  onTtsReadTimeReport?: (payload: { bookId: number; chapterId: number; seconds: number }) => void
}

export function TtsLayer(props: TtsLayerProps): React.ReactNode {
  const {
    bookId,
    bookMeta,
    chapterList,
    chapters,
    ttsVoiceTypes,
    ttsAudioUrl,
    isLoggedIn,
    onTtsAudioRequest,
    onTtsReadTimeReport
  } = props

  useTtsAudioBridge(ttsAudioUrl)

  const setVoiceTypes = useTtsStore((s) => s.setVoiceTypes)
  useEffect(() => {
    setVoiceTypes(ttsVoiceTypes)
  }, [ttsVoiceTypes, setVoiceTypes])

  const { audioRef } = useTtsEngine({
    bookId,
    chapters,
    chapterListLength: chapterList.length,
    isLoggedIn,
    onTtsAudioRequest,
    onTtsReadTimeReport
  })

  const { scrollToTtsSegment } = useTtsHighlightFollow()

  const session = useTtsSession(chapters)
  const {
    startTtsPlayback,
    ttsPrevChapter,
    ttsNextChapter,
    ttsSeekBackward,
    ttsSeekForward
  } = session

  useEffect(() => {
    registerTtsSessionActions({
      openTtsPopup: session.openTtsPopup,
      startTtsPlayback: session.startTtsPlayback,
      stopTtsSession: session.stopTtsSession,
      goTtsChapter: session.goTtsChapter,
      ttsPrevChapter: session.ttsPrevChapter,
      ttsNextChapter: session.ttsNextChapter,
      ttsSeekBackward: session.ttsSeekBackward,
      ttsSeekForward: session.ttsSeekForward
    })
    return () => unregisterTtsSessionActions()
  }, [
    session.openTtsPopup,
    session.startTtsPlayback,
    session.stopTtsSession,
    session.goTtsChapter,
    session.ttsPrevChapter,
    session.ttsNextChapter,
    session.ttsSeekBackward,
    session.ttsSeekForward
  ])

  const openPopup = useUiStore((s) => s.openPopup)

  const handleOpenCatalog = () => {
    openPopup('catalog', { source: 'tts' })
  }

  return (
    <>
      <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />

      <TtsPopup
        bookMeta={bookMeta}
        chapterList={chapterList}
        onStartPlayback={startTtsPlayback}
        onSeekBackward={ttsSeekBackward}
        onSeekForward={ttsSeekForward}
        onPrevChapter={() => void ttsPrevChapter()}
        onNextChapter={() => void ttsNextChapter()}
        onOpenCatalog={handleOpenCatalog}
      />

      <TtsReturnBar onReturn={() => void scrollToTtsSegment()} />
    </>
  )
}
