/**
 * 时间格式化（笔记/TTS 用）。
 *
 * 源码对照：old-vue-reader/utils/format-time.js:1-11
 */
/** 秒数 → "m:ss" 格式化（笔记/TTS 用）。非有限/负数返回 '0:00'。对齐 Vue format-time.js:1 */
export function formatSecondToTime(second: number): string {
  if (!Number.isFinite(second) || second < 0) {
    return '0:00'
  }

  const total = Math.floor(second)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
