import { USE_MOCK } from './index'
import { apiPost } from './request-helper'
import { mockFetchTtsAudio, MOCK_TTS_SILENT_MP3 } from './mock-store'

export interface TtsAudioRequest {
  reqId: string
  text: string
  voiceType: string
  chapterId: number
}

export interface TtsAudioResult {
  reqId: string
  url: string
  text: string
  voiceType: string
}

export async function fetchTtsAudio(
  bookId: number,
  req: TtsAudioRequest
): Promise<TtsAudioResult> {
  if (USE_MOCK) {
    return mockFetchTtsAudio(bookId, req)
  }
  const res = await apiPost<{
    code?: number
    body?: { url?: string; audioUrl?: string }
  }>('/audio/tts', {
    bookId,
    chapterId: req.chapterId,
    text: req.text,
    voiceType: req.voiceType,
    reqId: req.reqId
  })
  const url = res.body?.url || res.body?.audioUrl || ''
  if (Number(res.code) !== 0 || !url) {
    throw new Error('fetchTtsAudio failed')
  }
  return { reqId: req.reqId, url, text: req.text, voiceType: req.voiceType }
}

/** POST /audio/tts 原始响应（供需要 blob 的场景） */
export async function fetchTtsAudioRaw(
  bookId: number,
  req: TtsAudioRequest
): Promise<{ code: number; url?: string }> {
  if (USE_MOCK) {
    const result = mockFetchTtsAudio(bookId, req)
    return { code: 0, url: result.url }
  }
  try {
    const result = await fetchTtsAudio(bookId, req)
    return { code: 0, url: result.url }
  } catch {
    return { code: -1 }
  }
}

export { MOCK_TTS_SILENT_MP3 }
