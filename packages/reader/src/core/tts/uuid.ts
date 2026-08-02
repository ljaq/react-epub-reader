/**
 * TTS UUID 生成。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-uuid.js:1-12
 */

/** 生成 UUID v4（用于 TTS 段 uuid 与音频 reqId）。对齐 Vue tts-uuid.js:4 */
export function generateUUID(): string {
  let d = Date.now()
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, c => {
    const r = (d + Math.random() * 16) % 16 | 0
    d = Math.floor(d / 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
  return uuid
}
