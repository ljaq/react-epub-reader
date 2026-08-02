/**
 * TTS 退出确认。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-confirm.js:1-26
 *
 * 说明：源码 confirmTtsPlayPosition 从 components/TtsPlayPositionDialog/plugin re-export，
 * 属 UI 层（Phase 6），此处不移植。confirmTtsInterrupt 用 window.confirm，纯逻辑可测。
 */

import { getTtsBackConfirm, setTtsBackConfirm } from './storage'

/** 退出书籍中断 TTS 播放确认（window.confirm，rememberKey 时记忆选择）。对齐 Vue tts-confirm.js:5 */
export function confirmTtsInterrupt(
  message?: string,
  { rememberKey = false }: { rememberKey?: boolean } = {}
): Promise<boolean> {
  if (rememberKey && getTtsBackConfirm()) {
    return Promise.resolve(true)
  }

  const text = message || '退出书籍将中断播放语音朗读'
  const confirmed = window.confirm(text)
  if (confirmed && rememberKey) {
    setTtsBackConfirm(true)
  }
  return Promise.resolve(confirmed)
}

/** 退出阅读器时的 TTS 中断确认（默认文案）。对齐 Vue tts-confirm.js:18 */
export function confirmTtsLeaveReader(): Promise<boolean> {
  return confirmTtsInterrupt('退出书籍将中断播放语音朗读')
}
