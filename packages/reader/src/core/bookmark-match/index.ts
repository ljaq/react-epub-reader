/**
 * 书签位置匹配。
 *
 * 源码对照：old-vue-reader/utils/bookmark-match.js:1-78
 *
 * 横划：书签按章内 pageIndex 定位，同一 domPos 可跨多页，不可仅用 domPos 判断。
 * 竖滚：domPos + precent 联合匹配。
 */

export const BOOKMARK_ICON_URL =
  'https://static-efe-front-h.zhangyuecdn.com/sfm-production/enterprise/9cf1f7a4-fc3c-400f-860a-551c7aa0f8b6.png'

/** 取 domPos 的 base 部分（去掉 #N）。对齐 Vue bookmark-match.js:4 */
export function normalizeDomPosBase(domPos: string): string {
  if (!domPos) {
    return ''
  }
  return domPos.split('#')[0]
}

/** precent(0-1) → 章内页码（round 到 [0, pageCount-1]）。对齐 Vue bookmark-match.js:11 */
export function precentToPageIndex(precent: number, pageCount: number): number {
  const count = Math.max(1, Number(pageCount) || 1)
  if (count <= 1) {
    return 0
  }
  const ratio = Math.min(1, Math.max(0, Number(precent) || 0))
  return Math.round(ratio * (count - 1))
}

function isSameVerticalPosition(precentA: number, precentB: number): boolean {
  return Math.abs(Number(precentA) - Number(precentB)) < 0.015
}

interface BookmarkLike {
  pageIndex?: number
  cur?: number
  precent?: number
  domPos?: string
}

function resolveBookmarkPageIndex(bookmark: BookmarkLike, pageCount: number): number | null {
  if (Number.isFinite(bookmark.pageIndex)) {
    return Number(bookmark.pageIndex)
  }
  if (Number.isFinite(bookmark.cur)) {
    return Number(bookmark.cur)
  }
  if (Number.isFinite(bookmark.precent)) {
    return precentToPageIndex(Number(bookmark.precent), pageCount)
  }
  return null
}

export interface ReadingSnapshotLike {
  domPos?: string
  precent?: number
}

export interface FindBookmarkOptions {
  horizontal?: boolean
  pageCount?: number
  pageIndex?: number
}

/**
 * 在章节书签中找当前位置匹配的书签。
 * 横划：按章内 pageIndex（优先 pageIndex→cur→precent）匹配；
 * 竖滚：按 domPos base + precent（差值 < 0.015 视为同位）联合匹配。对齐 Vue bookmark-match.js:41。
 */
export function findBookmarkAtSnapshot<T extends BookmarkLike>(
  chapterBookmarks: T[] | null | undefined,
  snapshot: ReadingSnapshotLike | null | undefined,
  options: FindBookmarkOptions = {}
): T | null {
  const data = chapterBookmarks || []
  if (!data.length) {
    return null
  }

  const { horizontal = false, pageCount = 1, pageIndex = 0 } = options

  if (horizontal) {
    const currentPage = Number(pageIndex) || 0
    return (
      data.find(bookmark => {
        const bookmarkPage = resolveBookmarkPageIndex(bookmark, pageCount)
        return bookmarkPage !== null && bookmarkPage === currentPage
      }) || null
    )
  }

  if (!snapshot?.domPos) {
    return null
  }

  const snapshotBase = normalizeDomPosBase(snapshot.domPos)

  return (
    data.find(bookmark => {
      if (normalizeDomPosBase(bookmark.domPos || '') !== snapshotBase) {
        return false
      }

      if (Number.isFinite(bookmark.precent) && Number.isFinite(snapshot.precent)) {
        return isSameVerticalPosition(Number(bookmark.precent), Number(snapshot.precent))
      }

      return bookmark.domPos === snapshot.domPos
    }) || null
  )
}
