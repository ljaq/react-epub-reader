/**
 * 笔记中心弹层 — 对照 old-vue-reader/components/NotesPopup/index.vue。
 */
import { useEffect, useMemo, useState } from 'react'
import type { BookmarkItem, ChapterMeta, LineItem, NoteItem } from '../../../types'
import type { BookmarkListItem } from '../../../store/bookmark-store'
import {
  buildNavTargetFromBookmarkItem,
  buildNavTargetFromLineItem,
  buildNavTargetFromNoteItem
} from '../../../core/reading-position'
import { findBookmarkAtSnapshot } from '../../../core/bookmark-match'
import { DEFAULT_UNDERLINE_COLOR, isBackgroundLineColor } from '../../../core/highlights/line-mark'
import { syncChapterNotes } from '../../../core/highlights/note'
import { useAnnotationStore } from '../../../store/annotation-store'
import { useBookmarkStore } from '../../../store/bookmark-store'
import { useReaderDomStore } from '../../../store/reader-dom-store'
import { useReadingStore } from '../../../store/reading-store'
import { useUiStore } from '../../../store/ui-store'
import { useSettingsStore } from '../../../store/settings-store'
import { computeReadingSnapshotFromDom } from '../../../hooks/useReadingSnapshot'
import { navigateToNavTarget } from '../../../hooks/useNavigateToNavTarget'
import { BottomSheet } from '../../BottomSheet/BottomSheet'
import './notes-popup.css'

const TABS = [
  { key: 'line' as const, label: '划线' },
  { key: 'note' as const, label: '批注' },
  { key: 'bookmark' as const, label: '书签' }
]

type TabKey = (typeof TABS)[number]['key']

interface FlatLine extends LineItem {
  chapterName?: string
}

interface FlatNote extends NoteItem {
  chapterName?: string
}

interface FlatBookmark extends BookmarkListItem {
  chapterName?: string
}

function flattenLines(lines: Record<number, Record<string, LineItem>>): FlatLine[] {
  const items: FlatLine[] = []
  Object.keys(lines || {}).forEach((chapterKey) => {
    const bucket = lines[Number(chapterKey)]
    Object.values(bucket || {}).forEach((item) => {
      items.push({ ...item, chapterId: Number(chapterKey) })
    })
  })
  return items
}

function flattenNotes(notes: Record<number, Record<string, NoteItem>>): FlatNote[] {
  const items: FlatNote[] = []
  Object.keys(notes || {}).forEach((chapterKey) => {
    const bucket = notes[Number(chapterKey)]
    Object.values(bucket || {}).forEach((item) => {
      items.push({ ...item, chapterId: Number(chapterKey) })
    })
  })
  return items
}

function flattenBookmarks(
  bookmarks: Record<number, BookmarkItem[]>,
  chapterList: ChapterMeta[]
): FlatBookmark[] {
  const items: FlatBookmark[] = []
  Object.keys(bookmarks || {}).forEach((chapterKey) => {
    const cid = Number(chapterKey)
    const chapterName = chapterList.find((c) => Number(c.id) === cid)?.chapterName
    ;(bookmarks[cid] || []).forEach((item) => {
      items.push({ ...item, chapterId: cid, chapterName })
    })
  })
  return items
}

function displayBookmarkSummary(summary: string): string {
  return (summary || '').replace(/\s+/gu, ' ').trim()
}

function EmptyState(props: { description: string }) {
  return (
    <div className="notes-popup__empty">
      <p className="notes-popup__empty-text">{props.description}</p>
    </div>
  )
}

export interface NotesPopupProps {
  bookId: number
  chapterList: ChapterMeta[]
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  bookmarks: Record<number, BookmarkItem[]>
  onNoteDelete?: (payload: { bookId: number; webNoteId: string }) => void
  onBookmarkDelete?: (payload: { bookId: number; chapterId: number; id: string }) => void
}

export function NotesPopup(props: NotesPopupProps): React.ReactNode {
  const { bookId, chapterList, lines, notes, bookmarks, onNoteDelete, onBookmarkDelete } = props

  const visible = useUiStore((s) => s.popups.notes)
  const closePopup = useUiStore((s) => s.closePopup)
  const showToast = useUiStore((s) => s.showToast)
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageIndex = useReadingStore((s) => s.pageIndex)
  const pageCount = useReadingStore((s) => s.pageCount)
  const horizontalEnabled = useSettingsStore((s) => s.horizontalEnabled)

  const getMergedChapterLines = useAnnotationStore((s) => s.getMergedChapterLines)
  const getMergedChapterNotes = useAnnotationStore((s) => s.getMergedChapterNotes)
  const removePendingNote = useAnnotationStore((s) => s.removePendingNote)
  const addPendingNote = useAnnotationStore((s) => s.addPendingNote)
  const getMergedChapterBookmarks = useBookmarkStore((s) => s.getMergedChapterBookmarks)
  const removePendingBookmark = useBookmarkStore((s) => s.removePendingBookmark)
  const addPendingBookmark = useBookmarkStore((s) => s.addPendingBookmark)

  const [activeTab, setActiveTab] = useState<TabKey>('line')
  const [actionSheet, setActionSheet] = useState<{
    visible: boolean
    type: '' | 'note' | 'bookmark'
    item: FlatNote | FlatBookmark | null
  }>({ visible: false, type: '', item: null })

  const mergedLinesMap = useMemo(() => {
    const result: Record<number, Record<string, LineItem>> = {}
    const chapterIds = new Set([
      ...Object.keys(lines).map(Number),
      ...Object.keys(useAnnotationStore.getState().pendingLines).map(Number)
    ])
    chapterIds.forEach((cid) => {
      result[cid] = getMergedChapterLines(cid, lines).data
    })
    return result
  }, [lines, getMergedChapterLines])

  const mergedNotesMap = useMemo(() => {
    const result: Record<number, Record<string, NoteItem>> = {}
    const allChapterIds = new Set([
      ...Object.keys(notes).map(Number),
      ...Object.keys(useAnnotationStore.getState().pendingNotes).map(Number)
    ])
    allChapterIds.forEach((cid) => {
      result[cid] = getMergedChapterNotes(cid, notes).data
    })
    return result
  }, [notes, getMergedChapterNotes])

  const mergedBookmarksMap = useMemo(() => {
    const result: Record<number, BookmarkItem[]> = {}
    const allChapterIds = new Set([
      ...Object.keys(bookmarks).map(Number),
      ...Object.keys(useBookmarkStore.getState().pendingBookmarks).map(Number)
    ])
    allChapterIds.forEach((cid) => {
      result[cid] = getMergedChapterBookmarks(cid, bookmarks)
    })
    return result
  }, [bookmarks, getMergedChapterBookmarks])

  const flatLines = useMemo(() => flattenLines(mergedLinesMap), [mergedLinesMap])
  const flatNotes = useMemo(() => flattenNotes(mergedNotesMap), [mergedNotesMap])
  const flatBookmarks = useMemo(() => flattenBookmarks(mergedBookmarksMap, chapterList), [mergedBookmarksMap, chapterList])

  const chapterTitle =
    chapterList.find((c) => Number(c.id) === Number(chapterId))?.chapterName || ''

  useEffect(() => {
    if (!visible) {
      setActionSheet({ visible: false, type: '', item: null })
    }
  }, [visible])

  // phase-12 perf：仅在弹窗可见时计算快照，避免不必要的 DOM 扫描
  const currentSnapshot = visible
    ? horizontalEnabled
      ? null
      : computeReadingSnapshotFromDom()
    : null

  const handleClose = () => closePopup('notes')

  const navigateToItem = (targetChapterId: number, navTarget: ReturnType<typeof buildNavTargetFromLineItem>) => {
    if (!navTarget) return
    navigateToNavTarget(targetChapterId, navTarget)
    closePopup('notes')
  }

  const isCurrentBookmark = (item: FlatBookmark): boolean => {
    const match = findBookmarkAtSnapshot([item], currentSnapshot, {
      horizontal: horizontalEnabled,
      pageCount,
      pageIndex
    })
    return Boolean(match)
  }

  const copyToClipboard = async (text: string) => {
    if (!text) return
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  const deleteNoteOptimistic = async (item: FlatNote) => {
    const { webNoteId, chapterId: cid } = item
    const noteSnapshot = mergedNotesMap[cid]?.[webNoteId]
      ? { ...mergedNotesMap[cid][webNoteId] }
      : null

    removePendingNote(cid, webNoteId)
    const body = useReaderDomStore.getState().getBodyForChapter(cid)
    if (body && mergedNotesMap[cid]) {
      const nextData = { ...mergedNotesMap[cid] }
      delete nextData[webNoteId]
      syncChapterNotes(body, { data: nextData })
    }
    showToast('已删除')

    try {
      onNoteDelete?.({ bookId, webNoteId })
    } catch {
      if (noteSnapshot) {
        addPendingNote(cid, noteSnapshot)
        if (body) syncChapterNotes(body, { data: { ...mergedNotesMap[cid], [webNoteId]: noteSnapshot } })
      }
      showToast('删除失败，请重试')
    }
  }

  const deleteBookmarkOptimistic = async (item: FlatBookmark) => {
    const { chapterId: cid, id } = item
    const bookmarkSnapshot = mergedBookmarksMap[cid]?.find((b) => b.id === id)

    removePendingBookmark(cid, id)
    showToast('已删除')

    try {
      onBookmarkDelete?.({ bookId, chapterId: cid, id })
    } catch {
      if (bookmarkSnapshot) {
        addPendingBookmark(cid, bookmarkSnapshot)
      }
      showToast('删除失败，请重试')
    }
  }

  const handleDelete = async () => {
    const { type, item } = actionSheet
    if (!item) return
    setActionSheet({ visible: false, type: '', item: null })

    if (type === 'note') {
      await deleteNoteOptimistic(item as FlatNote)
      return
    }
    if (type === 'bookmark') {
      await deleteBookmarkOptimistic(item as FlatBookmark)
    }
  }

  const handleCopy = async () => {
    const item = actionSheet.item as FlatNote | null
    if (!item) return
    await copyToClipboard(item.content || '')
    showToast('已复制')
    setActionSheet({ visible: false, type: '', item: null })
  }

  const lineIconClass = (underlineColor?: string) =>
    isBackgroundLineColor(underlineColor)
      ? 'notes-popup__line-icon notes-popup__line-icon--background'
      : 'notes-popup__line-icon notes-popup__line-icon--underline'

  const lineIconStyle = (underlineColor?: string): React.CSSProperties => {
    const color = underlineColor || DEFAULT_UNDERLINE_COLOR
    if (isBackgroundLineColor(color)) {
      return { backgroundColor: color }
    }
    return {}
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} height="78vh" zIndex={10001}>
      <div className="notes-popup">
        <div className="notes-popup__header">
          <button type="button" className="notes-popup__close" aria-label="关闭" onClick={handleClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M1.86999 8.90145L9.431 16.4636C9.66565 16.6983 10.0265 16.7299 10.2951 16.5584L10.3398 16.5271L10.3798 16.4951L10.4179 16.4597L17.9789 8.89756C18.2383 8.63815 18.2496 8.2246 18.0127 7.95181L17.9789 7.91551L17.9425 7.88164C17.6827 7.65612 17.2953 7.65564 17.035 7.88018L16.9969 7.91554L9.92246 14.9907L2.85201 7.91943C2.59266 7.66005 2.17915 7.64874 1.90636 7.88553L1.87002 7.9194C1.59884 8.19058 1.59883 8.63025 1.86999 8.90145Z"
                fill="black"
              />
            </svg>
          </button>
        </div>
        <span className="notes-popup__title">{chapterTitle}</span>
        <div className="notes-popup__tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`notes-popup__tab${activeTab === tab.key ? ' notes-popup__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="notes-popup__body">
          {activeTab === 'line' && (
            <>
              {!flatLines.length ? (
                <EmptyState description="暂无划线，阅读页面长按可添加" />
              ) : (
                <div className="notes-popup__list">
                  {flatLines.map((item) => (
                    <button
                      key={item.webLineId}
                      type="button"
                      className="notes-popup__line-item"
                      onClick={() =>
                        navigateToItem(item.chapterId, buildNavTargetFromLineItem({ ...item, id: item.id ?? undefined }))
                      }
                    >
                      <div className="notes-popup__line-meta">
                        <span
                          className={lineIconClass(item.underlineColor)}
                          style={lineIconStyle(item.underlineColor)}
                        >
                          A
                        </span>
                        <span className="notes-popup__time">{item.time}</span>
                      </div>
                      <p className="notes-popup__line-summary">{item.summary}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'note' && (
            <>
              {!flatNotes.length ? (
                <EmptyState description="暂无批注，阅读页面长按可添加" />
              ) : (
                <div className="notes-popup__list">
                  {flatNotes.map((item) => (
                    <div key={item.webNoteId} className="notes-popup__note-item">
                      <div className="notes-popup__note-head">
                        <div className="notes-popup__note-meta">
                          <svg
                            className="notes-popup__note-icon"
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 18 18"
                            fill="none"
                          >
                            <path
                              d="M13 1.5C14.1046 1.5 15 2.39543 15 3.5V7.125C15 7.47018 14.7202 7.75 14.375 7.75C14.0298 7.75 13.75 7.47018 13.75 7.125V3.5C13.75 3.08579 13.4142 2.75 13 2.75H5C4.58579 2.75 4.25 3.08579 4.25 3.5V14.5C4.25 14.9142 4.58579 15.25 5 15.25H13C13.4142 15.25 13.75 14.9142 13.75 14.5V13.125C13.75 12.7798 14.0298 12.5 14.375 12.5C14.7202 12.5 15 12.7798 15 13.125V14.5C15 15.6046 14.1046 16.5 13 16.5H5C3.89543 16.5 3 15.6046 3 14.5V3.5C3 2.39543 3.89543 1.5 5 1.5H13ZM16.2034 8.17157C16.4475 8.41565 16.4475 8.81138 16.2034 9.05546L11.4305 13.8284C11.1864 14.0725 10.7907 14.0725 10.5466 13.8284C10.3025 13.5843 10.3025 13.1886 10.5466 12.9445L15.3195 8.17157C15.5636 7.9275 15.9593 7.9275 16.2034 8.17157ZM11.625 5C11.9702 5 12.25 5.27982 12.25 5.625C12.25 5.97018 11.9702 6.25 11.625 6.25H6.375C6.02982 6.25 5.75 5.97018 5.75 5.625C5.75 5.27982 6.02982 5 6.375 5H11.625Z"
                              fill="black"
                            />
                          </svg>
                          <span className="notes-popup__time">{item.time}</span>
                        </div>
                        <button
                          type="button"
                          className="notes-popup__more"
                          aria-label="更多"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActionSheet({ visible: true, type: 'note', item })
                          }}
                        >
                          <svg className="notes-popup__more-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M14.25 10C14.8023 10 15.25 9.55228 15.25 9C15.25 8.44772 14.8023 8 14.25 8C13.6977 8 13.25 8.44772 13.25 9C13.25 9.55228 13.6977 10 14.25 10ZM9 10C9.55228 10 10 9.55228 10 9C10 8.44772 9.55228 8 9 8C8.44772 8 8 8.44772 8 9C8 9.55228 8.44772 10 9 10ZM3.75 10C4.30228 10 4.75 9.55228 4.75 9C4.75 8.44772 4.30228 8 3.75 8C3.19772 8 2.75 8.44772 2.75 9C2.75 9.55228 3.19772 10 3.75 10Z" fill="black" />
                          </svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="notes-popup__note-body"
                        onClick={() =>
                          navigateToItem(item.chapterId, buildNavTargetFromNoteItem({ ...item, id: item.id ?? undefined }))
                        }
                      >
                        <p className="notes-popup__note-content">{item.content}</p>
                        <blockquote className="notes-popup__note-quote">{item.summary}</blockquote>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'bookmark' && (
            <>
              {!flatBookmarks.length ? (
                <EmptyState description="暂无书签" />
              ) : (
                <div className="notes-popup__list">
                  {flatBookmarks.map((item) => (
                    <div
                      key={item.id}
                      className={`notes-popup__bookmark-item${isCurrentBookmark(item) ? ' notes-popup__bookmark-item--current' : ''}`}
                    >
                      <button
                        type="button"
                        className="notes-popup__bookmark-main"
                        onClick={() =>
                          navigateToItem(item.chapterId, buildNavTargetFromBookmarkItem(item))
                        }
                      >
                        <div className="notes-popup__line-meta">
                          <svg className="notes-popup__bookmark-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M4.63741 16.3091C4.08428 16.5921 3.40647 16.3731 3.12347 15.82C3.04232 15.6613 3 15.4857 3 15.3075V3.5C3 2.39543 3.89543 1.5 5 1.5H13C14.1046 1.5 15 2.39543 15 3.5V15.3075C15 15.9289 14.4963 16.4325 13.875 16.4325C13.6968 16.4325 13.5212 16.3902 13.3626 16.3091L9 14.0771L4.63741 16.3091ZM13 2.75H5C4.58579 2.75 4.25 3.08579 4.25 3.5V15.1032L8.48759 12.9351C8.80936 12.7705 9.19064 12.7705 9.51241 12.9351L13.75 15.1032V3.5C13.75 3.08579 13.4142 2.75 13 2.75Z" fill="black" />
                          </svg>
                          <span className="notes-popup__time">{item.time}</span>
                        </div>
                        <p className="notes-popup__line-summary">{displayBookmarkSummary(item.summary)}</p>
                      </button>
                      <button
                        type="button"
                        className="notes-popup__more"
                        aria-label="更多"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActionSheet({ visible: true, type: 'bookmark', item })
                        }}
                      >
                        <svg className="notes-popup__more-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <path d="M14.25 10C14.8023 10 15.25 9.55228 15.25 9C15.25 8.44772 14.8023 8 14.25 8C13.6977 8 13.25 8.44772 13.25 9C13.25 9.55228 13.6977 10 14.25 10ZM9 10C9.55228 10 10 9.55228 10 9C10 8.44772 9.55228 8 9 8C8.44772 8 8 8.44772 8 9C8 9.55228 8.44772 10 9 10ZM3.75 10C4.30228 10 4.75 9.55228 4.75 9C4.75 8.44772 4.30228 8 3.75 8C3.19772 8 2.75 8.44772 2.75 9C2.75 9.55228 3.19772 10 3.75 10Z" fill="black" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {actionSheet.visible && (
        <div
          className="notes-popup__sheet-mask"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActionSheet({ visible: false, type: '', item: null })
            }
          }}
        >
          <div className="notes-popup__sheet">
            <button
              type="button"
              className="notes-popup__sheet-close"
              aria-label="关闭"
              onClick={() => setActionSheet({ visible: false, type: '', item: null })}
            >
              <svg className="notes-popup__sheet-close-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M1.86999 8.90145L9.431 16.4636C9.66565 16.6983 10.0265 16.7299 10.2951 16.5584L10.3398 16.5271L10.3798 16.4951L10.4179 16.4597L17.9789 8.89756C18.2383 8.63815 18.2496 8.2246 18.0127 7.95181L17.9789 7.91551L17.9425 7.88164C17.6827 7.65612 17.2953 7.65564 17.035 7.88018L16.9969 7.91554L9.92246 14.9907L2.85201 7.91943C2.59266 7.66005 2.17915 7.64874 1.90636 7.88553L1.87002 7.9194C1.59884 8.19058 1.59883 8.63025 1.86999 8.90145Z" fill="black" />
              </svg>
            </button>
            <div className="notes-popup__sheet-actions">
              <button type="button" className="notes-popup__sheet-action" onClick={handleDelete}>
                <svg className="notes-popup__sheet-action-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M19.4323 7.33366L18.9593 19.0759C18.904 20.4121 17.8956 21.5003 16.6205 21.5003H7.37963C6.10446 21.5003 5.09612 20.4121 5.04074 19.0759L4.56783 7.33366H3.83333C3.3731 7.33366 3 6.96056 3 6.50033C3 6.04009 3.3731 5.66699 3.83333 5.66699H20.1667C20.6269 5.66699 21 6.04009 21 6.50033C21 6.96056 20.6269 7.33366 20.1667 7.33366H19.4323ZM17.7642 7.33366H6.23593L6.70597 19.0069C6.72601 19.4904 7.04409 19.8337 7.37963 19.8337H16.6205C16.956 19.8337 17.2741 19.4904 17.2941 19.0069L17.7642 7.33366ZM9.5 2.66699H14.5C14.9602 2.66699 15.3333 3.04009 15.3333 3.50033C15.3333 3.96056 14.9602 4.33366 14.5 4.33366H9.5C9.03976 4.33366 8.66667 3.96056 8.66667 3.50033C8.66667 3.04009 9.03976 2.66699 9.5 2.66699ZM12.1667 9.33366C12.6269 9.33366 13 9.70676 13 10.167V16.5003C13 16.9606 12.6269 17.3337 12.1667 17.3337C11.7064 17.3337 11.3333 16.9606 11.3333 16.5003V10.167C11.3333 9.70676 11.7064 9.33366 12.1667 9.33366Z" fill="black" fillOpacity="0.85" />
                </svg>
                <span>删除</span>
              </button>
              {actionSheet.type === 'note' && (
                <button type="button" className="notes-popup__sheet-action" onClick={handleCopy}>
                  <svg className="notes-popup__sheet-action-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M6.66667 6.33333H13C14.4728 6.33333 15.6667 7.52724 15.6667 9V19.3333C15.6667 20.8061 14.4728 22 13 22H6.66667C5.19391 22 4 20.8061 4 19.3333V9C4 7.52724 5.19391 6.33333 6.66667 6.33333ZM6.5 8C6.03976 8 5.66667 8.3731 5.66667 8.83333V19.5C5.66667 19.9602 6.03976 20.3333 6.5 20.3333H13.1667C13.6269 20.3333 14 19.9602 14 19.5V8.83333C14 8.3731 13.6269 8 13.1667 8H6.5ZM10 4.66667C10 5.1269 9.6269 5.5 9.16667 5.5C8.70643 5.5 8.33333 5.1269 8.33333 4.66667C8.33333 3.19391 9.52724 2 11 2H17.3333C18.8061 2 20 3.19391 20 4.66667V15C20 16.4728 18.8061 17.6667 17.3333 17.6667C16.8731 17.6667 16.5 17.2936 16.5 16.8333C16.5 16.3731 16.8731 16 17.3333 16H17.5C17.9602 16 18.3333 15.6269 18.3333 15.1667V4.5C18.3333 4.03976 17.9602 3.66667 17.5 3.66667H10.8333C10.3731 3.66667 10 4.03976 10 4.5V4.66667Z" fill="black" fillOpacity="0.85" />
                  </svg>
                  <span>复制</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
