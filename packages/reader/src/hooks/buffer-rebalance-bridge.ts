/**
 * useChapterBuffer ↔ usePagination 之间的 rebalance 桥接。
 * Vue 版 rebalance 由 ReaderContent 单组件 orchestrate；React 拆成两个 hook，经本模块 120ms debounce 串联。
 */

const ENSURE_DEBOUNCE_MS = 120

type EnsureBufferFn = () => void
type RebalanceOrchestratorFn = () => Promise<void>
type GoChapterFn = (chapterId: number, pageIndexInChapter?: number) => void

let ensureBufferFn: EnsureBufferFn | null = null
let rebalanceOrchestratorFn: RebalanceOrchestratorFn | null = null
let goChapterFn: GoChapterFn | null = null
let ensureTimer: ReturnType<typeof setTimeout> | null = null

export function registerEnsureBuffer(fn: EnsureBufferFn | null): void {
  ensureBufferFn = fn
}

export function registerRebalanceOrchestrator(fn: RebalanceOrchestratorFn | null): void {
  rebalanceOrchestratorFn = fn
}

export function registerGoChapter(fn: GoChapterFn | null): void {
  goChapterFn = fn
}

/** 目录/进度条跨章跳转（对齐 Vue goChapter → rebuildChapterBuffer）。 */
export function goChapter(chapterId: number, pageIndexInChapter = 0): void {
  goChapterFn?.(chapterId, pageIndexInChapter)
}

/** 由 useChapterBuffer 在 chapterId 逼近 buffer 边缘时调用（对齐 Vue scheduleEnsureBuffer）。 */
export function scheduleBufferRebalance(): void {
  if (ensureTimer) clearTimeout(ensureTimer)
  ensureTimer = setTimeout(() => {
    ensureTimer = null
    void rebalanceOrchestratorFn?.()
  }, ENSURE_DEBOUNCE_MS)
}

/** 由 usePagination rebalanceBuffer 调用，仅更新 store 中的 buffer（对齐 Vue ensureChapterBuffer）。 */
export function runEnsureBuffer(): void {
  ensureBufferFn?.()
}

export function clearBufferRebalanceBridge(): void {
  if (ensureTimer) clearTimeout(ensureTimer)
  ensureTimer = null
  ensureBufferFn = null
  rebalanceOrchestratorFn = null
  goChapterFn = null
}
