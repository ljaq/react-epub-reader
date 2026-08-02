/**
 * TTS 音频流桥接 — onTtsAudioRequest fire-and-forget + ttsAudioUrl prop 注入。
 *
 * 契约 §6：宿主收到 onTtsAudioRequest 后异步 fetch，通过 ttsAudioUrl prop 回注 URL。
 */
import { useEffect, useRef } from 'react'
import type { TtsAudioEntry } from '../types'
import type { FetchTtsAudioRawFn, TtsAudioRawResponse } from '../core/tts/audio-api'
import TTS_CONSTANT from '../core/tts/constant'

interface PendingAudioRequest {
  resolve: (value: TtsAudioRawResponse | null) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingRequests = new Map<string, PendingAudioRequest>()

function resolvePending(reqId: string, response: TtsAudioRawResponse | null): void {
  const pending = pendingRequests.get(reqId)
  if (!pending) return
  clearTimeout(pending.timer)
  pending.resolve(response)
  pendingRequests.delete(reqId)
}

/** 将宿主注入的 TtsAudioEntry 转为引擎 fetchTtsAudioRaw 响应格式。 */
export function injectTtsAudioUrl(entry: TtsAudioEntry): void {
  resolvePending(entry.reqId, {
    code: 0,
    body: {
      data: entry.url,
      reqid: entry.reqId
    }
  })
}

/** 创建 fetchTtsAudioRaw 注入实现（fire-and-forget 回调，Promise 等待 prop 注入）。 */
export function createFetchTtsAudioRaw(
  onTtsAudioRequest?: (req: {
    reqId: string
    text: string
    voiceType: string
    chapterId: number
  }) => void
): FetchTtsAudioRawFn {
  return (params) =>
    new Promise<TtsAudioRawResponse | null>((resolve) => {
      const timer = setTimeout(() => {
        resolvePending(params.reqId, null)
      }, TTS_CONSTANT.TIMEOUT.AJAX)

      pendingRequests.set(params.reqId, { resolve, timer })

      // fire-and-forget：不 await 回调返回值
      onTtsAudioRequest?.({
        reqId: params.reqId,
        text: params.text,
        voiceType: params.voiceType,
        chapterId: params.chapterId
      })
    })
}

/** 监听 ttsAudioUrl prop 变化并注入待处理队列。 */
export function useTtsAudioBridge(ttsAudioUrl?: TtsAudioEntry | null): void {
  const lastReqIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!ttsAudioUrl?.reqId || !ttsAudioUrl.url) return
    if (lastReqIdRef.current === ttsAudioUrl.reqId) return
    lastReqIdRef.current = ttsAudioUrl.reqId
    injectTtsAudioUrl(ttsAudioUrl)
  }, [ttsAudioUrl])
}

/** 测试/卸载时清空 pending 队列。 */
export function clearPendingTtsAudioRequests(): void {
  pendingRequests.forEach((pending) => {
    clearTimeout(pending.timer)
    pending.resolve(null)
  })
  pendingRequests.clear()
}
