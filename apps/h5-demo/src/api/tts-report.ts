import { USE_MOCK } from './index'
import { apiPost } from './request-helper'
import { mockReportTtsReadTime } from './mock-store'

export async function reportTtsReadTime(
  bookId: number,
  payload: { chapterId: number; seconds: number }
): Promise<void> {
  if (USE_MOCK) {
    mockReportTtsReadTime(bookId, payload)
    return
  }
  await apiPost('/read/tts/report', {
    bookId,
    chapterId: payload.chapterId,
    seconds: payload.seconds
  })
}
