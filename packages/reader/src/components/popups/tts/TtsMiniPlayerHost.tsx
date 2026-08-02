/**
 * BottomBar 内嵌 MiniPlayer — 左下角 16px 定位相对底栏。
 */
import type { BookMeta } from '../../../types'
import { useTtsStore } from '../../../store/tts-store'
import { callOpenTtsPopup, callStartTtsPlayback, callStopTtsSession } from './tts-actions'
import { TtsMiniPlayer } from './TtsMiniPlayer'

export interface TtsMiniPlayerHostProps {
  bookMeta: BookMeta
}

export function TtsMiniPlayerHost(props: TtsMiniPlayerHostProps): React.ReactNode {
  const { bookMeta } = props

  const handleTogglePlay = async () => {
    const engine = useTtsStore.getState().engine
    if (engine?.audioPlayer?.src) {
      useTtsStore.getState().toggleTtsPlaying()
      return
    }
    await callStartTtsPlayback()
  }

  return (
    <TtsMiniPlayer
      bookMeta={bookMeta}
      onOpenPanel={() => void callOpenTtsPopup()}
      onTogglePlay={() => void handleTogglePlay()}
      onClose={callStopTtsSession}
    />
  )
}
