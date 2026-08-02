/**
 * 当前阅读快照计算 — 对照 Vue computeReadingSnapshot + buildReadingSnapshot。
 */
import { buildReadingSnapshot } from '../core/reading-position'
import { useReaderDomStore } from '../store/reader-dom-store'
import { useReadingStore } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'

export function computeReadingSnapshotFromDom(): ReturnType<typeof buildReadingSnapshot> {
  const horizontal = useSettingsStore.getState().horizontalEnabled
  const { pageIndex, pageCount } = useReadingStore.getState()
  const chapterId = useReadingStore.getState().chapterId
  const dom = useReaderDomStore.getState()

  const bodyEl = dom.getBodyForChapter(chapterId)
  const rootEl = dom.getScrollRoot()
  const viewportEl = dom.getViewportEl()

  return buildReadingSnapshot({
    rootEl,
    bodyEl,
    viewportEl,
    horizontal,
    pageIndex,
    pageCount
  })
}

export function syncReadingSnapshotToStore(): void {
  const snapshot = computeReadingSnapshotFromDom()
  useReadingStore.getState().updateReadingSnapshot({
    domPos: snapshot.domPos,
    summary: snapshot.summary,
    rawSummary: snapshot.rawSummary,
    precent: snapshot.precent,
    strIdx: snapshot.strIdx
  })
}

export function getScrollTop(): number {
  return useReaderDomStore.getState().getScrollRoot()?.scrollTop ?? 0
}
