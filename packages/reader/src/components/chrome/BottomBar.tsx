/**
 * 底栏 — 源码对照 old-vue-reader/components/ReaderChrome/BottomBar/index.vue。
 * 第一层 ChapterProgress（toolbarPanelOpen 时隐藏，让位给设置/字体面板）；
 * 第二层 ToolBar（五入口）。
 * SettingsPanel/FontPanel 内嵌于底栏容器（visible 由各自依据 uiVisible+activePanel 派生）。
 * TtsMiniPlayer 挂载于 BottomBar（Phase 6）。
 */
import type { BookMeta, ChapterAccess, ChapterMeta } from '../../types'
import type { ReaderChromeSlots, ReaderSlotCtx } from '../../types/props'
import { useUiStore } from '../../store/ui-store'
import { ChapterProgress } from './ChapterProgress'
import { ToolBar } from './ToolBar'
import { SettingsPanel } from '../settings/SettingsPanel'
import { FontPanel } from '../settings/FontPanel'
import { TtsMiniPlayerHost } from '../popups/tts/TtsMiniPlayerHost'

export interface BottomBarProps {
  visible: boolean
  bookId: number
  chapterId: number
  isLoggedIn: boolean
  chapterList: ChapterMeta[]
  chapterAccess: Record<number, ChapterAccess>
  bookMeta: BookMeta
  pageIndex: number
  pageCount: number
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
  slotCtx: ReaderSlotCtx
  chromeSlots?: ReaderChromeSlots
}

const TOOLBAR_PANELS = ['settings', 'font']

export function BottomBar(props: BottomBarProps): React.ReactNode {
  const { visible, slotCtx, chromeSlots, ...progressProps } = props
  const activePanel = useUiStore((s) => s.activePanel)
  const toolbarPanelOpen = activePanel !== null && TOOLBAR_PANELS.includes(activePanel)
  const chapterProgressVisible = visible && !toolbarPanelOpen

  return (
    <div className={`reader-bottom-bar${visible ? ' reader-bottom-bar--visible' : ''}`}>
      <TtsMiniPlayerHost bookMeta={props.bookMeta} />
      <ChapterProgress visible={chapterProgressVisible} {...progressProps} />
      <SettingsPanel />
      <FontPanel />
      <ToolBar
        slotCtx={slotCtx}
        chromeSlots={chromeSlots}
        allowTts={props.bookMeta.allowTts !== false}
        isLoggedIn={props.isLoggedIn}
        onLoginRequired={props.onLoginRequired}
      />
    </div>
  )
}
