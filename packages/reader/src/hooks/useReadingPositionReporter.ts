/**
 * 阅读进度上报 — port Vue ReadingPositionReporter（reading-position-report.js）。
 *
 * debounce 800ms + 30s 定时 → onReadingPositionChange(ReadingSnapshot)。
 * 不调 saveReadPosition API（宿主 fire-and-forget）。
 */
import { useEffect, useRef } from 'react'
import type { ChapterMeta, ReadingSnapshot } from '../types'
import { buildReadPositionPayload } from '../core/reading-position'
import { computeReadingSnapshotFromDom, getScrollTop } from './useReadingSnapshot'
import { useReadingStore } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'

export const DEFAULT_DEBOUNCE_MS = 800
export const DEFAULT_INTERVAL_MS = 30000

export interface UseReadingPositionReporterOptions {
  bookId: number
  chapterList: ChapterMeta[]
  isLoggedIn: boolean
  onReadingPositionChange?: (snapshot: ReadingSnapshot) => void
}

class ReadingPositionReporter {
  private intervalMs: number
  private debounceMs: number
  private intervalTimer: ReturnType<typeof setInterval> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private options: UseReadingPositionReporterOptions

  constructor(options: UseReadingPositionReporterOptions) {
    this.options = options
    this.intervalMs = DEFAULT_INTERVAL_MS
    this.debounceMs = DEFAULT_DEBOUNCE_MS
  }

  updateOptions(options: UseReadingPositionReporterOptions): void {
    this.options = options
  }

  canReport(): boolean {
    if (!this.options.isLoggedIn) return false
    const bookId = this.options.bookId
    const chapterId = useReadingStore.getState().chapterId
    return Boolean(bookId && chapterId)
  }

  buildPosPayload(): ReadingSnapshot | null {
    const snapshot = computeReadingSnapshotFromDom()
    if (!snapshot?.domPos) return null

    const horizontal = useSettingsStore.getState().horizontalEnabled
    const { chapterId, pageIndex, pageCount } = useReadingStore.getState()

    const payloadStr = buildReadPositionPayload({
      chapterId,
      chapterList: this.options.chapterList,
      snapshot,
      horizontal,
      pageIndex,
      pageCount,
      scrollTop: getScrollTop()
    })

    try {
      const parsed = JSON.parse(payloadStr) as Record<string, unknown>
      return {
        chapterId: Number(parsed.chapterId ?? chapterId),
        domPos: String(snapshot.domPos),
        precent: Number(snapshot.precent) || 0,
        pageIndex: horizontal ? pageIndex : undefined
      }
    } catch {
      return {
        chapterId,
        domPos: snapshot.domPos,
        precent: snapshot.precent,
        pageIndex: horizontal ? pageIndex : undefined
      }
    }
  }

  reportNow(): void {
    if (!this.canReport() || !this.options.onReadingPositionChange) return
    const pos = this.buildPosPayload()
    if (!pos) return
    this.options.onReadingPositionChange(pos)
  }

  scheduleReport(delay = this.debounceMs): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.reportNow()
    }, delay)
  }

  startInterval(): void {
    this.stopInterval(false)
    if (typeof window === 'undefined') return
    this.intervalTimer = window.setInterval(() => {
      this.reportNow()
    }, this.intervalMs)
  }

  stopInterval(report = true): void {
    if (this.intervalTimer) {
      window.clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
    if (report) {
      this.reportNow()
    }
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.stopInterval(true)
  }
}

let activeReporter: ReadingPositionReporter | null = null

/** 供 ReaderContent 滚动等场景触发 debounce 上报 */
export function scheduleReadingPositionReport(): void {
  activeReporter?.scheduleReport()
}

export function useReadingPositionReporter(options: UseReadingPositionReporterOptions): {
  scheduleReport: () => void
} {
  const reporterRef = useRef<ReadingPositionReporter | null>(null)

  if (!reporterRef.current) {
    reporterRef.current = new ReadingPositionReporter(options)
  }
  reporterRef.current.updateOptions(options)
  activeReporter = reporterRef.current

  const chapterId = useReadingStore((s) => s.chapterId)
  const pageIndex = useReadingStore((s) => s.pageIndex)
  const globalPageIndex = useReadingStore((s) => s.globalPageIndex)
  const atChapterEnd = useReadingStore((s) => s.readingSnapshot.atChapterEnd)
  const horizontalEnabled = useSettingsStore((s) => s.horizontalEnabled)

  useEffect(() => {
    reporterRef.current?.startInterval()
    return () => {
      reporterRef.current?.destroy()
      if (activeReporter === reporterRef.current) {
        activeReporter = null
      }
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handler = () => {
      const reporter = reporterRef.current
      if (!reporter) return
      if (document.visibilityState === 'hidden') {
        reporter.stopInterval(true)
        return
      }
      if (document.visibilityState === 'visible') {
        reporter.reportNow()
        reporter.startInterval()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    reporterRef.current?.scheduleReport()
  }, [chapterId, pageIndex, globalPageIndex, atChapterEnd, horizontalEnabled, options.isLoggedIn])

  return {
    scheduleReport: () => reporterRef.current?.scheduleReport()
  }
}
