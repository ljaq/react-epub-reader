/**
 * 阅读器壳层 — 源码对照 old-vue-reader/components/ReaderChrome/index.vue。
 *
 * 整合 TopBar / BookshelfBtn / BottomBar（含 ChapterProgress + ToolBar + SettingsPanel + FontPanel）。
 * visible 态由 ui-store.uiVisible 驱动；CSS 动画显隐 0.28s（顶栏下坠、底栏上涌、书架右→左）。
 * 悬浮定位（position:fixed inset:0 pointer-events:none），不占文档流。
 *
 * 插槽体系：渲染 ReaderChromeSlots 7 锚点中的 5 个 UI 锚点
 *  （topBarLeft/topBarRight/topBarMoreMenu/toolbarExtra 在各子组件内渲染；
 *   contentOverlay/bottomExtension/rootOverlay 在此渲染）。
 * ReaderSlotCtx 注入 bookId/chapterId/navigate。
 */
import { useMemo } from 'react'
import type { BookMeta, BookmarkItem, ChapterAccess, ChapterMeta } from '../../types'
import type { BookmarkListItem } from '../../store/bookmark-store'
import type { ReaderChromeSlots, ReaderSlotCtx } from '../../types/props'
import { useUiStore } from '../../store/ui-store'
import { useReadingStore } from '../../store/reading-store'
import { useSettingsStore } from '../../store/settings-store'
import { useBookmarkStore } from '../../store/bookmark-store'
import { TopBar } from './TopBar'
import { BookshelfBtn } from './BookshelfBtn'
import { BottomBar } from './BottomBar'
import './chrome.css'

export interface ReaderChromeProps {
  bookId: number
  chapterList: ChapterMeta[]
  chapterAccess: Record<number, ChapterAccess>
  bookmarks: Record<number, BookmarkItem[]>
  bookMeta: BookMeta
  isLoggedIn: boolean
  inBookshelf: boolean
  chromeSlots?: ReaderChromeSlots
  /** 宿主注入路由方法（契约缺口：ReaderProps 未暴露 navigate，见自查报告）。 */
  navigate?: (path: string) => void
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
  onBookshelfAdd?: (bookId: number) => void
  onBookmarkCreate?: (payload: BookmarkItem) => void
  onBookmarkDelete?: (payload: { bookId: number; chapterId: number; id: string }) => void
}

export function ReaderChrome(props: ReaderChromeProps): React.ReactNode {
  const {
    bookId,
    chapterList,
    chapterAccess,
    bookmarks,
    bookMeta,
    isLoggedIn,
    inBookshelf,
    chromeSlots,
    navigate,
    onLoginRequired,
    onBookshelfAdd,
    onBookmarkCreate,
    onBookmarkDelete
  } = props

  const uiVisible = useUiStore((s) => s.uiVisible)
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageIndex = useReadingStore((s) => s.pageIndex)
  const pageCount = useReadingStore((s) => s.pageCount)
  const horizontalEnabled = useSettingsStore((s) => s.horizontalEnabled)
  const getMergedChapterBookmarks = useBookmarkStore((s) => s.getMergedChapterBookmarks)

  const slotCtx: ReaderSlotCtx = {
    bookId,
    chapterId,
    navigate: navigate ?? (() => {})
  }

  const chapterBookmarks: BookmarkListItem[] = useMemo(
    () => getMergedChapterBookmarks(chapterId, bookmarks),
    [getMergedChapterBookmarks, chapterId, bookmarks]
  )

  return (
    <div className="reader-chrome">
      {chromeSlots?.rootOverlay ? chromeSlots.rootOverlay(slotCtx) : null}

      <TopBar
        visible={uiVisible}
        bookId={bookId}
        chapterId={chapterId}
        isLoggedIn={isLoggedIn}
        chapterList={chapterList}
        chapterBookmarks={chapterBookmarks}
        horizontalEnabled={horizontalEnabled}
        pageIndex={pageIndex}
        pageCount={pageCount}
        onLoginRequired={onLoginRequired}
        onBookmarkCreate={onBookmarkCreate}
        onBookmarkDelete={onBookmarkDelete}
        slotCtx={slotCtx}
        chromeSlots={chromeSlots}
      />

      <BookshelfBtn
        visible={uiVisible}
        inBookshelf={inBookshelf}
        bookId={bookId}
        onBookshelfAdd={onBookshelfAdd}
      />

      {chromeSlots?.contentOverlay ? chromeSlots.contentOverlay(slotCtx) : null}

      <BottomBar
        visible={uiVisible}
        bookId={bookId}
        chapterId={chapterId}
        isLoggedIn={isLoggedIn}
        chapterList={chapterList}
        chapterAccess={chapterAccess}
        bookMeta={bookMeta}
        pageIndex={pageIndex}
        pageCount={pageCount}
        onLoginRequired={onLoginRequired}
        slotCtx={slotCtx}
        chromeSlots={chromeSlots}
      />

      {chromeSlots?.bottomExtension ? chromeSlots.bottomExtension(slotCtx) : null}
    </div>
  )
}
