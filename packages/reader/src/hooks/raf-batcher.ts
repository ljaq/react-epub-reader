/**
 * rAF 合帧器 — 高频运动值写入的帧对齐（phase-11 性能/手感专项）。
 *
 * 120Hz 触控采样下 pointermove 触发频率可高于屏幕刷新率；同帧多次
 * schedule 只保留最后一次 task 执行，把「每 move 一次写」合并为
 * 「每帧至多一次写」，与显示器 vsync 对齐。
 *
 * 纯 TS、rAF 可注入（单测 fake rAF 手动步进）。
 */

export interface RafBatcher {
  /** 安排任务：同帧多次调用只执行最后一次；帧回调后自动复位可再排 */
  schedule: (task: () => void) => void
  /** 取消挂起的帧回调与任务；幂等 */
  cancel: () => void
}

type RafFn = (cb: () => void) => number
type CancelRafFn = (id: number) => void

const defaultRaf: RafFn = (cb) => requestAnimationFrame(cb)
const defaultCancelRaf: CancelRafFn = (id) => cancelAnimationFrame(id)

export function createRafBatcher(
  raf: RafFn = defaultRaf,
  cancelRaf: CancelRafFn = defaultCancelRaf
): RafBatcher {
  let rafId: number | null = null
  let pending: (() => void) | null = null

  return {
    schedule(task) {
      pending = task
      if (rafId !== null) return
      rafId = raf(() => {
        rafId = null
        const taskToRun = pending
        pending = null
        taskToRun?.()
      })
    },
    cancel() {
      pending = null
      if (rafId !== null) {
        cancelRaf(rafId)
        rafId = null
      }
    }
  }
}
