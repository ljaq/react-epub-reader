/**
 * TTS 音频 API（base64/blob、音频信息获取、状态判定）。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-audio-api.js:1-99
 *
 * 重要：源码 getTTSAudioInfo 直接 import fetchTtsAudioRaw（api/tts），属 fetch 层。
 * 本模块改为依赖注入：调用方传入 fetchTtsAudioRaw 实现。Phase 6 将其桥接到
 * onTtsAudioRequest（fire-and-forget）+ ttsAudioUrl prop 注入队列
 * （见 plans/00-总览与契约.md §6 TTS 音频流）。
 */

export interface TtsAudioRawResponse {
  code: number
  html?: string
  body?: {
    data?: string
    addition?: {
      duration?: number
      frontend?: string | { words?: { word: string; start_time: number; end_time: number; unit_type?: string }[] }
    }
    reqid?: string
  }
}

export type FetchTtsAudioRawFn = (params: {
  bookId: number | string
  chapterId: number
  text: string
  voiceType: string
  reqId: string
}) => Promise<TtsAudioRawResponse | null>

/** base64 → Blob（支持 data: 前缀剥离）。对齐 Vue tts-audio-api.js:7 */
export function base64toBlob(b64Data: string, contentType: string = '', sliceSize: number = 512): Blob {
  const normalized = String(b64Data || '').replace(/^data:[^;]+;base64,/u, '')
  const byteCharacters = atob(normalized)
  const byteArrays: Uint8Array[] = []

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize)
    const byteNumbers = new Array(slice.length)

    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i)
    }

    byteArrays.push(new Uint8Array(byteNumbers))
  }

  return new Blob(byteArrays as BlobPart[], { type: contentType })
}

function resolveAudioUrl(data: string): string | null {
  if (!data) {
    return null
  }

  if (typeof data === 'string' && data.startsWith('data:')) {
    return data
  }

  if (typeof data === 'string' && data.startsWith('blob:')) {
    return data
  }

  const blob = base64toBlob(data, 'audio/mp3')
  return URL.createObjectURL(blob)
}

export interface TtsAudioInfoResult {
  audioUrl: string | null
  duration: number
  reqid: string
  words: { word: string; start_time: number; end_time: number; unit_type?: string }[]
  uuid: string
  chapterId: number
}

/**
 * 拉取 TTS 音频信息（含重试）。**fetchTtsAudioRaw 由调用方注入**（Phase 6 桥接到
 * onTtsAudioRequest + ttsAudioUrl prop 队列，契约 §6）。返回 audioUrl/words/duration 或 'error'。
 * 对齐 Vue tts-audio-api.js:43。
 */
export async function getTTSAudioInfo({
  bookId,
  chapterId,
  uuid,
  text,
  voiceType,
  retryCount = 3,
  fetchTtsAudioRaw
}: {
  bookId: number | string
  chapterId: number
  uuid: string
  text: string
  voiceType: string
  retryCount?: number
  fetchTtsAudioRaw: FetchTtsAudioRawFn
}): Promise<TtsAudioInfoResult | 'error'> {
  const normalizedText = String(text || '').replace(/[ \n]+/gu, '')

  try {
    const res = await fetchTtsAudioRaw({
      bookId,
      chapterId,
      text: normalizedText,
      voiceType,
      reqId: uuid
    })

    if (!res || Number(res.code) !== 0 || !res.body || !res.body.data) {
      if (retryCount > 0) {
        return getTTSAudioInfo({ bookId, chapterId, uuid, text, voiceType, retryCount: retryCount - 1, fetchTtsAudioRaw })
      }
      return 'error'
    }

    const { body } = res
    const audioUrl = resolveAudioUrl(body.data as string)
    let words: { word: string; start_time: number; end_time: number; unit_type?: string }[] = []

    if (body.addition && body.addition.frontend) {
      const frontend =
        typeof body.addition.frontend === 'string' ? JSON.parse(body.addition.frontend) : body.addition.frontend
      words = frontend.words || []
    }

    return {
      audioUrl,
      duration: body.addition?.duration || 0,
      reqid: body.reqid || uuid,
      words,
      uuid,
      chapterId
    }
  } catch (error) {
    console.warn('getTTSAudioInfo failed', error)
    if (retryCount > 0) {
      return getTTSAudioInfo({ bookId, chapterId, uuid, text, voiceType, retryCount: retryCount - 1, fetchTtsAudioRaw })
    }
    return 'error'
  }
}

export interface TtsAudioState {
  httpStatus: 'pending' | 'done' | 'error'
  uuid?: string
}

/** 音频对象状态判定：httpStatus === 'done'。 */
export function isAudioLoaded(audio: TtsAudioState | null | undefined): boolean {
  return Boolean(audio && audio.httpStatus === 'done')
}

/** 音频对象状态判定：httpStatus === 'pending'。 */
export function isAudioPending(audio: TtsAudioState | null | undefined): boolean {
  return Boolean(audio && audio.httpStatus === 'pending')
}

/** 音频对象状态判定：httpStatus === 'error'。 */
export function isAudioError(audio: TtsAudioState | null | undefined): boolean {
  return Boolean(audio && audio.httpStatus === 'error')
}
