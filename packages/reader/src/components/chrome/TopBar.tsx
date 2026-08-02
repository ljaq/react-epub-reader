/**
 * 顶栏 — 源码对照 old-vue-reader/components/ReaderChrome/TopBar/index.vue。
 */
import { useEffect, useRef, useState } from 'react'
import type { BookmarkItem, ChapterMeta } from '../../types'
import type { BookmarkListItem } from '../../store/bookmark-store'
import type { ReaderChromeSlots, ReaderSlotCtx } from '../../types/props'
import { useBookmarkActions } from '../../hooks/useBookmarkActions'
import { confirmTtsLeaveReader } from '../../core/tts/confirm'
import { isTtsActivelyPlaying } from '../../store/tts-store'
import { stopTtsSessionGlobal } from '../popups/tts/tts-actions'

export interface TopBarProps {
  visible: boolean
  bookId: number
  chapterId: number
  isLoggedIn: boolean
  chapterList: ChapterMeta[]
  chapterBookmarks: BookmarkListItem[]
  horizontalEnabled: boolean
  pageIndex: number
  pageCount: number
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
  onBookmarkCreate?: (payload: BookmarkItem) => void
  onBookmarkDelete?: (payload: { bookId: number; chapterId: number; id: string }) => void
  slotCtx: ReaderSlotCtx
  chromeSlots?: ReaderChromeSlots
}

function BackIcon() {
  return (
    <svg className="reader-top-bar__back-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M13.3186 2.24403L4.24405 11.3172C3.96243 11.5988 3.92451 12.0318 4.13029 12.3542L4.16783 12.4078L4.20622 12.4558L4.24866 12.5015L13.3233 21.5747C13.6346 21.886 14.1308 21.8995 14.4582 21.6153L14.5018 21.5747L14.5424 21.5311C14.813 21.2193 14.8136 20.7544 14.5441 20.442L14.5017 20.3963L6.01146 11.907L14.497 3.42246C14.8083 3.11124 14.8219 2.61503 14.5377 2.28768L14.4971 2.24408C14.1717 1.91866 13.6441 1.91864 13.3186 2.24403Z" fill="black" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg className="reader-top-bar__more-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M19 13.3332C19.7364 13.3332 20.3334 12.7362 20.3334 11.9998C20.3334 11.2635 19.7364 10.6665 19 10.6665C18.2636 10.6665 17.6667 11.2635 17.6667 11.9998C17.6667 12.7362 18.2636 13.3332 19 13.3332ZM12 13.3332C12.7364 13.3332 13.3334 12.7362 13.3334 11.9998C13.3334 11.2635 12.7364 10.6665 12 10.6665C11.2636 10.6665 10.6667 11.2635 10.6667 11.9998C10.6667 12.7362 11.2636 13.3332 12 13.3332ZM5.00002 13.3332C5.7364 13.3332 6.33335 12.7362 6.33335 11.9998C6.33335 11.2635 5.7364 10.6665 5.00002 10.6665C4.26364 10.6665 3.66669 11.2635 3.66669 11.9998C3.66669 12.7362 4.26364 13.3332 5.00002 13.3332Z" fill="black" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg className="reader-top-bar__menu-item-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4.12216 14.4971C3.63049 14.7487 3.02799 14.554 2.77644 14.0623C2.7043 13.9214 2.66669 13.7652 2.66669 13.6069V3.11127C2.66669 2.12943 3.46263 1.3335 4.44446 1.3335H11.5556C12.5374 1.3335 13.3334 2.12943 13.3334 3.11127V13.6069C13.3334 14.1592 12.8856 14.6069 12.3334 14.6069C12.175 14.6069 12.0189 14.5693 11.8779 14.4971L8.00002 12.5131L4.12216 14.4971ZM11.5556 2.44461H4.44446C4.07627 2.44461 3.7778 2.74308 3.7778 3.11127V13.4252L7.54454 11.498C7.83056 11.3517 8.16948 11.3517 8.4555 11.498L12.2222 13.4252V3.11127C12.2222 2.74308 11.9238 2.44461 11.5556 2.44461Z" fill="black" />
    </svg>
  )
}

export function TopBar(props: TopBarProps): React.ReactNode {
  const {
    visible,
    bookId,
    chapterId,
    isLoggedIn,
    chapterList,
    chapterBookmarks,
    horizontalEnabled,
    pageIndex,
    pageCount,
    onLoginRequired,
    onBookmarkCreate,
    onBookmarkDelete,
    slotCtx,
    chromeSlots
  } = props

  const [menuVisible, setMenuVisible] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement | null>(null)

  const { getCurrentBookmark, addCurrentBookmark, removeCurrentBookmark } = useBookmarkActions({
    bookId,
    chapterId,
    chapterList,
    chapterBookmarks,
    horizontalEnabled,
    pageIndex,
    pageCount,
    onBookmarkCreate,
    onBookmarkDelete
  })

  useEffect(() => {
    if (!menuVisible) return
    const handler = (e: MouseEvent) => {
      const node = menuWrapRef.current
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setMenuVisible(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuVisible])

  const currentBookmark = getCurrentBookmark()
  const hasCurrentBookmark = Boolean(currentBookmark)
  const bookmarkMenuLabel = hasCurrentBookmark ? '删除书签' : '添加书签'

  const handleBack = async () => {
    if (isTtsActivelyPlaying()) {
      const confirmed = await confirmTtsLeaveReader()
      if (!confirmed) return
      stopTtsSessionGlobal()
    }
    if (typeof window !== 'undefined' && window.history) {
      window.history.back()
    }
  }

  const handleLogin = () => {
    onLoginRequired?.('auth')
  }

  const handleBookmark = () => {
    setMenuVisible(false)
    if (!isLoggedIn) {
      onLoginRequired?.('auth')
      return
    }
    if (hasCurrentBookmark) {
      removeCurrentBookmark()
      return
    }
    addCurrentBookmark()
  }

  return (
    <div className={`reader-top-bar${visible ? ' reader-top-bar--visible' : ''}`}>
      <div className="reader-top-bar__left">
        <button type="button" className="reader-top-bar__back" aria-label="返回" onClick={handleBack}>
          <BackIcon />
        </button>
        {chromeSlots?.topBarLeft ? chromeSlots.topBarLeft(slotCtx) : null}
      </div>

      <div className="reader-top-bar__right">
        {chromeSlots?.topBarRight ? chromeSlots.topBarRight(slotCtx) : null}
        {!isLoggedIn ? (
          <button type="button" className="reader-top-bar__login" onClick={handleLogin}>
            登录
          </button>
        ) : (
          <div className="reader-top-bar__more-wrap" ref={menuWrapRef}>
            <button type="button" className="reader-top-bar__more" aria-label="更多" onClick={() => setMenuVisible((v) => !v)}>
              <MoreIcon />
            </button>
            {menuVisible ? (
              <div className="reader-top-bar__menu">
                {chromeSlots?.topBarMoreMenu ? chromeSlots.topBarMoreMenu(slotCtx) : null}
                <button type="button" className="reader-top-bar__menu-item" onClick={handleBookmark}>
                  <BookmarkIcon />
                  {bookmarkMenuLabel}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
