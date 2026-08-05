/**
 * 当前阅读快照计算 — 对照 Vue computeReadingSnapshot + buildReadingSnapshot。
 */
import { buildReadingSnapshot } from '../core/reading-position'
import { useReaderDomStore } from '../store/reader-dom-store'
import { useReadingStore } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'

export interface ComputeReadingSnapshotOptions {
  /**
   * phase-12 perf：横划模式跳过逐字符 getClientRects 扫描（成本 O(当前页之前字符数)），
   * 锚点降级为段落级。仅用于进度上报等高频路径；书签等需字符级精度的路径勿传。
   */
  coarseHorizontalAnchor?: boolean
}

export function computeReadingSnapshotFromDom(
  options?: ComputeReadingSnapshotOptions
): ReturnType<typeof buildReadingSnapshot> {
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
    pageCount,
    coarseHorizontalAnchor: options?.coarseHorizontalAnchor
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
