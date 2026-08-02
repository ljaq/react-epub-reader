/**
 * navTarget 跳转 + applier — 对照 Vue navigateToNavTarget:929 + applyNavTargetWithRetry:1710。
 */
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { ReadingSnapshot } from '../types'
import { goChapter as goChapterViaBuffer } from './buffer-rebalance-bridge'
import { localToGlobal } from '../core/chapter-buffer'
import {
  applyNavTarget,
  isDomPosOnlyNavTarget,
  isNavTargetPaginationReady,
  resolveDomPosNavTargetPageIndex,
  resolveGoChapterInitialPageIndex,
  resolvePageIndexFromNavTarget,
  splitDomPos
} from '../core/reading-position'
import { PAGE_COLUMN_GAP } from '../core/pagination'
import { useReaderDomStore } from '../store/reader-dom-store'
import { useReadingStore, type NavTarget } from '../store/reading-store'
import { useSettingsStore } from '../store/settings-store'
import { syncReadingSnapshotToStore } from './useReadingSnapshot'

function waitFor(
  predicate: () => boolean,
  { timeoutMs = 2000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) {
        resolve(true)
        return
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false)
        return
      }
      setTimeout(tick, intervalMs)
    }
    tick()
  })
}

async function waitForTargetChapterBody(chapterId: number): Promise<Element | null> {
  const result = await waitFor(() => Boolean(useReaderDomStore.getState().getBodyForChapter(chapterId)))
  if (!result) return null
  return useReaderDomStore.getState().getBodyForChapter(chapterId)
}

async function waitForBufferIdle(): Promise<boolean> {
  return waitFor(() => {
    const { buffer } = useReadingStore.getState()
    return !buffer.loading && !buffer.silentExpand
  })
}

async function waitForLineMark(chapterId: number, webLineId: string): Promise<boolean> {
  return waitFor(() => {
    const body = useReaderDomStore.getState().getBodyForChapter(chapterId)
    if (!body) return false
    return Boolean(body.querySelector(`[data-web-line-id="${webLineId}"]`))
  })
}

function applyHorizontalNavTarget(navTarget: NavTarget): boolean {
  const state = useReadingStore.getState()
  const bodyEl = useReaderDomStore.getState().getBodyForChapter(state.chapterId)
  if (!bodyEl || !isNavTargetPaginationReady(navTarget, state.pageCount)) {
    return false
  }

  const measureOptions = {
    pageGap: PAGE_COLUMN_GAP,
    viewportHeight: useReaderDomStore.getState().getViewportEl()?.clientHeight ?? 0
  }

  let pageIdx = 0
  if (isDomPosOnlyNavTarget(navTarget)) {
    if (!state.pageWidth) return false
    const resolved = resolveDomPosNavTargetPageIndex(
      navTarget,
      bodyEl,
      state.pageWidth,
      state.pageCount,
      measureOptions
    )
    if (resolved === null) return false
    pageIdx = resolved
  } else {
    const resolved = resolvePageIndexFromNavTarget(navTarget, state.pageCount, {
      bodyEl,
      pageWidth: state.pageWidth
    })
    pageIdx = resolved ?? 0
  }

  state.setGlobalPageIndex(localToGlobal(state.chapterId, pageIdx, state.buffer))
  state.clearNavTarget()
  syncReadingSnapshotToStore()
  return true
}

function applyVerticalNavTarget(navTarget: NavTarget): boolean {
  const state = useReadingStore.getState()
  const bodyEl = useReaderDomStore.getState().getBodyForChapter(state.chapterId)
  const rootEl = useReaderDomStore.getState().getScrollRoot()
  if (!bodyEl || !rootEl) return false

  applyNavTarget({
    rootEl,
    bodyEl,
    horizontal: false,
    navTarget,
    clearNavTarget: () => state.clearNavTarget()
  })

  if (!useReadingStore.getState().navTarget) {
    syncReadingSnapshotToStore()
    return true
  }
  return false
}

async function applyNavTargetWithRetry(): Promise<boolean> {
  const navTarget = useReadingStore.getState().navTarget
  if (!navTarget?.chapterId) return true

  const targetChapterId = Number(navTarget.chapterId)
  await waitForTargetChapterBody(targetChapterId)
  await waitForBufferIdle()

  if (navTarget.webLineId) {
    await waitForLineMark(targetChapterId, navTarget.webLineId)
  }

  // 等章 id 与目标对齐（跨章 goChapter 后）
  await waitFor(() => Number(useReadingStore.getState().chapterId) === targetChapterId)

  const horizontal = useSettingsStore.getState().horizontalEnabled
  const applied = horizontal
    ? applyHorizontalNavTarget(navTarget)
    : applyVerticalNavTarget(navTarget)

  return applied && !useReadingStore.getState().navTarget
}

/** 跨章/同章设置 navTarget 并触发 applier */
export function navigateToNavTarget(chapterId: number, navTarget: NavTarget): void {
  const targetId = Number(chapterId)
  if (!targetId || !navTarget) return

  const merged: NavTarget = { ...navTarget, chapterId: targetId }
  const state = useReadingStore.getState()

  if (Number(state.chapterId) !== targetId) {
    state.setNavTarget(merged)
    state.resetForChapterSwitch(targetId)

    const horizontal = useSettingsStore.getState().horizontalEnabled
    if (horizontal) {
      const existingPageCount = state.buffer.segments[targetId]?.pageCount
      const pageIndexInChapter = resolveGoChapterInitialPageIndex(merged, existingPageCount)
      goChapterViaBuffer(targetId, pageIndexInChapter)
    } else {
      goChapterViaBuffer(targetId, 0)
    }
  } else {
    state.setNavTarget(merged)
  }
}

export function navTargetFromReadingSnapshot(snapshot: ReadingSnapshot): NavTarget {
  const chapterId = Number(snapshot.chapterId)
  const { domPosBase, curTextIdx } = splitDomPos(snapshot.domPos || '0=1=0=0#0')
  return {
    chapterId,
    domPos: `${domPosBase}#${curTextIdx}`,
    precent: snapshot.precent,
    pageIndex: snapshot.pageIndex,
    strIdx: 0
  }
}

export function useNavigateToNavTarget(): {
  navigateToNavTarget: typeof navigateToNavTarget
} {
  const applierRunningRef = useRef(false)
  const navTarget = useReadingStore((s) => s.navTarget)
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageCount = useReadingStore((s) => s.pageCount)
  const bufferReady = useReadingStore((s) => s.bufferReady)
  const initialLayoutSettled = useReadingStore((s) => s.initialLayoutSettled)
  const bootContentReady = useReadingStore((s) => s.bootContentReady)

  useEffect(() => {
    // 首屏还原由 useInitialPositionRestore 独占，避免与揭开遮罩竞态
    if (!bootContentReady) return
    if (!navTarget || applierRunningRef.current) return
    if (Number(navTarget.chapterId) !== Number(chapterId)) return

    applierRunningRef.current = true
    void applyNavTargetWithRetry().finally(() => {
      applierRunningRef.current = false
    })
  }, [navTarget, chapterId, pageCount, bufferReady, initialLayoutSettled, bootContentReady])

  const navigate = useCallback((targetChapterId: number, target: NavTarget) => {
    navigateToNavTarget(targetChapterId, target)
  }, [])

  return { navigateToNavTarget: navigate }
}

/** 遮罩淡出时长；此期间保持 layoutLocked，避免邻居章 silentExpand 露出翻页动画 */
export const BOOT_LOADING_FADE_MS = 280

export function useInitialPositionRestore(options: {
  initialPosition?: ReadingSnapshot
  consumedRef: MutableRefObject<boolean>
}): void {
  const { initialPosition, consumedRef } = options
  const bufferReady = useReadingStore((s) => s.bufferReady)
  const initialLayoutSettled = useReadingStore((s) => s.initialLayoutSettled)

  useEffect(() => {
    if (useReadingStore.getState().bootContentReady) return
    if (!bufferReady || !initialLayoutSettled) return
    if (consumedRef.current) return

    let cancelled = false
    let lockedLayout = false
    consumedRef.current = true

    async function revealAfterRestore(): Promise<void> {
      useReadingStore.getState().setLayoutLocked(true)
      lockedLayout = true
      try {
        if (initialPosition?.chapterId) {
          const navTarget = navTargetFromReadingSnapshot(initialPosition)
          navigateToNavTarget(initialPosition.chapterId, navTarget)
          await applyNavTargetWithRetry()
        }

        await waitFor(() => {
          const { buffer } = useReadingStore.getState()
          return !buffer.loading && !buffer.silentExpand
        }, { timeoutMs: 2500 })

        if (cancelled) return

        if (initialPosition?.chapterId) {
          const navTarget = navTargetFromReadingSnapshot(initialPosition)
          useReadingStore.getState().setNavTarget({
            ...navTarget,
            chapterId: Number(initialPosition.chapterId)
          })
          await applyNavTargetWithRetry()
        }

        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
        if (cancelled) return

        // 横划淡出由 HorizontalReader 本地 overlay 禁 transition；此处先解锁再 mark，避免 deps 触发 cleanup 卡死 layoutLocked
        useReadingStore.getState().setLayoutLocked(false)
        lockedLayout = false
        useReadingStore.getState().markBootContentReady()
        await new Promise((r) => setTimeout(r, BOOT_LOADING_FADE_MS))
      } finally {
        if (lockedLayout) {
          useReadingStore.getState().setLayoutLocked(false)
        }
      }
    }

    void revealAfterRestore()
    return () => {
      cancelled = true
      useReadingStore.getState().setLayoutLocked(false)
    }
    // 勿将 bootContentReady 列入 deps：markBootContentReady 会触发 cleanup 导致 layoutLocked 无法释放
  }, [initialPosition, bufferReady, initialLayoutSettled, consumedRef])
}
