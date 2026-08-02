/**
 * 试读结束提示同步 — 对照 old-vue-reader/store/reader-context.js syncTrialEndTipState:146。
 */
import { useCallback } from 'react'
import { useUiStore } from '../store/ui-store'
import { useReadingStore } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'

export function syncTrialEndTipState(options: {
  isLoggedIn: boolean
  feeChapterId: number | null | undefined
  chapterId: number
  horizontalEnabled: boolean
  pageIndex: number
  pageCount: number
  atChapterEnd: boolean
}): void {
  const { showReadLoginTip, hideReadLoginTip } = useUiStore.getState()

  if (options.isLoggedIn || !options.feeChapterId) {
    hideReadLoginTip()
    return
  }

  const lastTrialId = options.feeChapterId - 1
  const onLastTrialChapter = Number(options.chapterId) === lastTrialId
  if (!onLastTrialChapter) {
    hideReadLoginTip()
    return
  }

  let onLastPage = false
  if (options.horizontalEnabled) {
    onLastPage = options.pageIndex >= options.pageCount - 1
  } else {
    onLastPage = Boolean(options.atChapterEnd)
  }

  if (onLastPage) {
    showReadLoginTip()
  } else {
    hideReadLoginTip()
  }
}

export function useTrialEndTip(options: {
  isLoggedIn: boolean
  paidChapterStart?: number
}): { syncTrialEndTip: () => void } {
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageIndex = useReadingStore((s) => s.pageIndex)
  const pageCount = useReadingStore((s) => s.pageCount)
  const atChapterEnd = useReadingStore((s) => s.readingSnapshot.atChapterEnd)
  const horizontalEnabled = useSettingsStore((s) => s.horizontalEnabled)

  const syncTrialEndTip = useCallback(() => {
    syncTrialEndTipState({
      isLoggedIn: options.isLoggedIn,
      feeChapterId: options.paidChapterStart ?? null,
      chapterId,
      horizontalEnabled,
      pageIndex,
      pageCount,
      atChapterEnd
    })
  }, [
    options.isLoggedIn,
    options.paidChapterStart,
    chapterId,
    horizontalEnabled,
    pageIndex,
    pageCount,
    atChapterEnd
  ])

  return { syncTrialEndTip }
}
