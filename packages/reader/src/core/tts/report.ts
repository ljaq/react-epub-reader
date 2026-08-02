/**
 * TTS 播放时长上报。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-report.js:1-70
 *
 * 重要：源码 reportTtsReadTime 直接 import api/tts-report（fetch），属 fetch 层。
 * 本模块改为依赖注入：调用方传入 reportReadTime 实现。Phase 6 将其桥接到
 * onTtsReadTimeReport 回调（见 plans/00-总览与契约.md §6）。
 */

import TTS_CONSTANT from './constant'

export type ReportTtsReadTimeFn = (payload: {
  bookId: number
  chapterId: number
  intervalMinute: number
}) => Promise<void> | void

/** TTS 播放时长上报器。**reportReadTime 由构造注入**（Phase 6 桥接到 onTtsReadTimeTime，契约 §6）。对齐 Vue tts-report.js:7 */
export class TtsReport {
  start = 0
  end = 0
  reportTimer: ReturnType<typeof setInterval> | null = null
  private getBookId: () => number | string | null
  private getChapterId: () => number | null
  private isLoggedIn: () => boolean
  private reportReadTime: ReportTtsReadTimeFn

  constructor(options: {
    getBookId?: () => number | string | null
    getChapterId?: () => number | null
    isLoggedIn?: () => boolean
    reportReadTime?: ReportTtsReadTimeFn
  } = {}) {
    this.getBookId = options.getBookId || (() => null)
    this.getChapterId = options.getChapterId || (() => null)
    this.isLoggedIn = options.isLoggedIn || (() => false)
    this.reportReadTime = options.reportReadTime || (() => {})
  }

  resetStart(): void {
    this.start = Date.now()
  }

  startReportTimer(): void {
    if (this.reportTimer) {
      this.stopReportTimer()
    }
    this.resetStart()
    this.setTTSReadTime()
    this.reportTimer = setInterval(() => {
      this.setTTSReadTime()
    }, TTS_CONSTANT.TTS_REPORT_INTERVAL)
  }

  stopReportTimer(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer)
      this.reportTimer = null
    }
    this.setTTSReadTime()
  }

  setTTSReadTime(): void {
    if (this.start === 0) {
      return
    }

    this.end = Date.now()
    const duration = this.end - this.start
    this.start = this.end
    const intervalMinute = Math.round(duration / TTS_CONSTANT.TTS_REPORT_INTERVAL)

    if (intervalMinute < 1) {
      return
    }

    if (!this.isLoggedIn()) {
      return
    }

    const bookId = this.getBookId()
    const chapterId = this.getChapterId()
    if (!bookId || !chapterId) {
      return
    }

    Promise.resolve(this.reportReadTime({ bookId: Number(bookId), chapterId, intervalMinute })).catch(() => null)
  }
}
