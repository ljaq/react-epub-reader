/**
 * 批注高亮（note mark）。
 *
 * 源码对照：old-vue-reader/utils/note-highlight.js:1-266
 *
 * 关键常量：BADGE_TOP_OFFSET = 20（note-highlight.js:44，角标偏移）
 */

import { buildTargetRangeFromPosInfo, findLineTarget } from './line'

export const BADGE_TOP_OFFSET = 20

/** 按 summary 去空白生成 groupKey（同原文不同空白归为同组批注）。 */
function buildGroupKey(summary: string): string {
  return (summary || '').replace(/\s+/gu, '')
}

export interface NoteItemLike {
  posInfo?: Record<string, number>
  summary?: string
  content?: string
  id?: number | null
  webNoteId?: string
}

export interface NoteGroup {
  groupKey: string
  summary: string
  posInfo: Record<string, number>
  notes: NoteItemLike[]
}

export interface ChapterNotesData {
  data?: Record<string, NoteItemLike>
}

/**
 * 把章节批注按 summary 分组（同组多批注按 id 降序）。
 * 用于同一段落的多个批注共用一个 note mark。对齐 Vue note-highlight.js:7。
 */
export function groupChapterNotes(chapterNotesData: ChapterNotesData | null | undefined): NoteGroup[] {
  if (!chapterNotesData?.data) {
    return []
  }

  const groups = new Map<string, NoteGroup>()

  Object.keys(chapterNotesData.data).forEach(webNoteId => {
    const noteItem = chapterNotesData.data![webNoteId]
    const summary = noteItem.summary || ''
    const groupKey = buildGroupKey(summary)

    if (!groupKey) {
      return
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        summary,
        posInfo: noteItem.posInfo || {},
        notes: []
      })
    }

    groups.get(groupKey)!.notes.push({ ...noteItem, webNoteId })
  })

  return Array.from(groups.values()).map(group => ({
    ...group,
    notes: group.notes.sort((a, b) => (b.id || 0) - (a.id || 0))
  }))
}

function getMarkLineEndRect(mark: Element): DOMRect {
  const rects = Array.from(mark.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
  if (!rects.length) {
    return mark.getBoundingClientRect()
  }

  return rects.reduce((best, rect) => {
    if (rect.bottom > best.bottom + 1) {
      return rect
    }
    if (Math.abs(rect.bottom - best.bottom) <= 1 && rect.right > best.right) {
      return rect
    }
    return best
  })
}

function getBadgeTop(lineEndRect: DOMRect, containerRect: DOMRect | null): number {
  return lineEndRect.bottom - BADGE_TOP_OFFSET - (containerRect?.top || 0)
}

function isRectVisibleInViewport(rect: DOMRect, viewportEl: Element | null): boolean {
  if (!viewportEl || !rect) {
    return true
  }

  const viewportRect = viewportEl.getBoundingClientRect()
  return (
    rect.bottom > viewportRect.top &&
    rect.top < viewportRect.bottom &&
    rect.right > viewportRect.left &&
    rect.left < viewportRect.right
  )
}

function isMarkVisibleOnPage(mark: Element, viewportEl: Element | null): boolean {
  if (!viewportEl) {
    return true
  }

  const rects = (mark as HTMLElement).getClientRects()
  if (rects.length) {
    for (let i = 0; i < rects.length; i += 1) {
      if (isRectVisibleInViewport(rects[i], viewportEl)) {
        return true
      }
    }
    return false
  }

  return isRectVisibleInViewport((mark as HTMLElement).getBoundingClientRect(), viewportEl)
}

function wrapRangeWithNoteMark(range: Range, group: NoteGroup): HTMLElement {
  const mark = document.createElement('span')
  mark.className = 'reader-note-mark'
  mark.setAttribute('data-note-group', group.groupKey)
  mark.setAttribute('data-note-count', String(group.notes.length))

  try {
    range.surroundContents(mark)
  } catch {
    const fragment = range.extractContents()
    mark.appendChild(fragment)
    range.insertNode(mark)
  }

  return mark
}

function resolveNoteTargetRange(rootEl: Element, group: NoteGroup): Range | null {
  if (!rootEl || !group?.summary) {
    return null
  }

  if (group.posInfo && Object.keys(group.posInfo).length) {
    const posInfoRange = buildTargetRangeFromPosInfo(rootEl, group.posInfo)
    if (posInfoRange) {
      return posInfoRange
    }
  }

  const target = findLineTarget(
    rootEl,
    { summary: group.summary, posInfo: group.posInfo },
    { skipLineMarks: false, skipNoteMarks: true }
  )
  if (!target) {
    return null
  }

  const range = document.createRange()
  range.setStart(target.startNode, target.startOffset)
  range.setEnd(target.endNode, target.endOffset)
  return range
}

/**
 * 包裹批注 mark：已存在则更新 count；优先按 posInfo 建 Range，否则按 summary 文本定位。
 * 用 surroundContents 包裹，跨节点失败时回退 extractContents。对齐 Vue note-highlight.js:143。
 */
export function wrapNoteMark(rootEl: Element, group: NoteGroup): HTMLElement | null {
  if (!rootEl || !group?.groupKey || !group.summary) {
    return null
  }

  const existing = rootEl.querySelector(`.reader-note-mark[data-note-group="${group.groupKey}"]`)
  if (existing) {
    existing.setAttribute('data-note-count', String(group.notes.length))
    return existing as HTMLElement
  }

  const range = resolveNoteTargetRange(rootEl, group)
  if (!range) {
    return null
  }

  return wrapRangeWithNoteMark(range, group)
}

function unwrapNoteMarkElement(mark: HTMLElement): void {
  if (!mark?.parentNode) {
    return
  }

  const parent = mark.parentNode
  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark)
  }
  parent.removeChild(mark)
}

/**
 * 同步章节批注：先移除不再有效的 note mark，再包裹所有分组，返回成功 groupKey 列表。
 * 对齐 Vue note-highlight.js:174。
 */
export function syncChapterNotes(rootEl: Element, chapterNotesData: ChapterNotesData | null | undefined): string[] {
  if (!rootEl) {
    return []
  }

  const groups = groupChapterNotes(chapterNotesData || { data: {} })
  const validKeys = new Set(groups.map(group => group.groupKey))

  rootEl.querySelectorAll('.reader-note-mark[data-note-group]').forEach(mark => {
    const groupKey = mark.getAttribute('data-note-group')
    if (!validKeys.has(groupKey || '')) {
      unwrapNoteMarkElement(mark as HTMLElement)
    }
  })

  const applied: string[] = []
  groups.forEach(group => {
    if (wrapNoteMark(rootEl, group)) {
      applied.push(group.groupKey)
    }
  })

  return applied
}

/** applyChapterNotes = syncChapterNotes（别名）。对齐 Vue note-highlight.js:199 */
export function applyChapterNotes(rootEl: Element, chapterNotesData: ChapterNotesData | null | undefined): string[] {
  return syncChapterNotes(rootEl, chapterNotesData)
}

export interface SyncNoteBadgesOptions {
  mode?: 'vertical' | 'horizontal'
  viewportEl?: Element | null
  resolveChapterId?: (rootEl: Element) => string | number
}

/**
 * 同步批注角标到 badgesContainer：遍历所有 body 的 note mark，按行末矩形定位角标 top
 * （横划用 lineEndRect.bottom - BADGE_TOP_OFFSET；竖滚减 containerRect.top）。
 * 横划仅渲染当前视口可见 mark。对齐 Vue note-highlight.js:203。
 */
export function syncNoteBadges(
  badgesContainer: HTMLElement | null,
  contentBodies: Element[] | null,
  options: SyncNoteBadgesOptions = {}
): void {
  if (!badgesContainer) {
    return
  }

  const { mode = 'vertical', viewportEl = null, resolveChapterId } = options
  const isHorizontal = mode === 'horizontal'

  badgesContainer.innerHTML = ''
  const seen = new Set<string>()
  const containerRect = badgesContainer.getBoundingClientRect()

  ;(contentBodies || []).forEach(rootEl => {
    if (!rootEl) {
      return
    }

    const chapterId = resolveChapterId ? resolveChapterId(rootEl) : ''

    rootEl.querySelectorAll('.reader-note-mark[data-note-group]').forEach(mark => {
      const groupKey = mark.getAttribute('data-note-group')
      if (!groupKey || seen.has(groupKey)) {
        return
      }

      if (isHorizontal && !isMarkVisibleOnPage(mark, viewportEl)) {
        return
      }

      seen.add(groupKey)

      const lineEndRect = getMarkLineEndRect(mark)
      if (!lineEndRect.width && !lineEndRect.height) {
        return
      }

      const badge = document.createElement('span')
      badge.className = 'reader-note-badge'
      badge.setAttribute('data-note-group', groupKey)
      if (chapterId) {
        badge.setAttribute('data-chapter-id', String(chapterId))
      }
      badge.textContent = mark.getAttribute('data-note-count') || '1'

      if (isHorizontal) {
        badge.style.top = `${lineEndRect.bottom - BADGE_TOP_OFFSET}px`
      } else {
        badge.style.top = `${getBadgeTop(lineEndRect, containerRect)}px`
      }

      badgesContainer.appendChild(badge)
    })
  })
}

/** 按 groupKey 取该组的所有批注条目。对齐 Vue note-highlight.js:258 */
export function getNotesByGroupId(
  chapterNotesData: ChapterNotesData | null | undefined,
  groupKey: string
): NoteItemLike[] {
  if (!chapterNotesData?.data || !groupKey) {
    return []
  }

  const groups = groupChapterNotes(chapterNotesData)
  const group = groups.find(item => item.groupKey === groupKey)
  return group ? group.notes : []
}
