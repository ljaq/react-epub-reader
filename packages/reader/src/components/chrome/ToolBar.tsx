/**
 * 工具栏 — 源码对照 old-vue-reader/components/ReaderChrome/ToolBar/index.vue。
 * 五入口：目录/设置/语音朗读/字体/笔记。
 *  - settings/font → setActivePanel/closePanel 切换（面板内嵌底栏，不遮五图标）
 *  - catalog/notes → togglePopup
 *  - tts → togglePopup('tts')（Phase 6 接真实播放器）
 * chromeSlots.toolbarExtra(ctx) 渲染宿主扩展项。
 */
import type { ReaderChromeSlots, ReaderSlotCtx } from '../../types/props'
import { useUiStore } from '../../store/ui-store'
import type { ActivePanel, PopupName } from '../../store/ui-store'
import { CatalogIcon, SettingsIcon, TtsIcon } from './ToolBarIcons'
import { FontIcon, NotesIcon } from './FontNotesIcons'

import { callOpenTtsPopup } from '../popups/tts/tts-actions'

export interface ToolBarProps {
  slotCtx: ReaderSlotCtx
  chromeSlots?: ReaderChromeSlots
  allowTts?: boolean
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
  isLoggedIn?: boolean
}

const PANEL_KEYS = ['settings', 'font'] as const
const POPUP_KEYS = ['catalog', 'tts', 'notes'] as const

type PanelKey = (typeof PANEL_KEYS)[number]
type PopupKey = (typeof POPUP_KEYS)[number]
type ItemKey = PanelKey | PopupKey

export function ToolBar(props: ToolBarProps): React.ReactNode {
  const { slotCtx, chromeSlots, allowTts = true, onLoginRequired, isLoggedIn = true } = props
  const activePanel = useUiStore((s) => s.activePanel)
  const popups = useUiStore((s) => s.popups)
  const setActivePanel = useUiStore((s) => s.setActivePanel)
  const closePanel = useUiStore((s) => s.closePanel)
  const togglePopup = useUiStore((s) => s.togglePopup)

  const handleItemClick = (key: ItemKey) => {
    if ((PANEL_KEYS as readonly string[]).includes(key)) {
      if (activePanel === key) {
        closePanel()
      } else {
        setActivePanel(key as ActivePanel)
      }
      return
    }
    if ((POPUP_KEYS as readonly string[]).includes(key)) {
      if (key === 'tts') {
        if (!isLoggedIn) {
          onLoginRequired?.('auth')
          return
        }
        void callOpenTtsPopup()
        return
      }
      togglePopup(key as PopupName)
    }
  }

  return (
    <div className="reader-tool-bar">
      <button
        type="button"
        className={`reader-tool-bar__item${popups.catalog ? ' reader-tool-bar__item--active' : ''}`}
        onClick={() => handleItemClick('catalog')}
      >
        <span className="reader-tool-bar__icon">
          <CatalogIcon />
        </span>
        <span className="reader-tool-bar__label">目录</span>
      </button>

      <button
        type="button"
        className={`reader-tool-bar__item${activePanel === 'settings' ? ' reader-tool-bar__item--active' : ''}`}
        onClick={() => handleItemClick('settings')}
      >
        <span className="reader-tool-bar__icon">
          <SettingsIcon active={activePanel === 'settings'} />
        </span>
        <span className="reader-tool-bar__label">设置</span>
      </button>

      <button
        type="button"
        className={`reader-tool-bar__item${popups.tts ? ' reader-tool-bar__item--active' : ''}`}
        onClick={() => handleItemClick('tts')}
        style={allowTts ? undefined : { display: 'none' }}
      >
        <span className="reader-tool-bar__icon">
          <TtsIcon />
        </span>
        <span className="reader-tool-bar__label">语音朗读</span>
      </button>

      <button
        type="button"
        className={`reader-tool-bar__item${activePanel === 'font' ? ' reader-tool-bar__item--active' : ''}`}
        onClick={() => handleItemClick('font')}
      >
        <span className="reader-tool-bar__icon">
          <FontIcon active={activePanel === 'font'} />
        </span>
        <span className="reader-tool-bar__label">字体</span>
      </button>

      <button
        type="button"
        className={`reader-tool-bar__item${popups.notes ? ' reader-tool-bar__item--active' : ''}`}
        onClick={() => handleItemClick('notes')}
      >
        <span className="reader-tool-bar__icon">
          <NotesIcon />
        </span>
        <span className="reader-tool-bar__label">笔记</span>
      </button>

      {chromeSlots?.toolbarExtra ? chromeSlots.toolbarExtra(slotCtx) : null}
    </div>
  )
}
