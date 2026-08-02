/**
 * 章节导航辅助 — chrome（ChapterProgress / CatalogPopup）调用以切换中心章。
 *
 * 源码对照：old-vue-reader/store/reader-context.js goChapter:1271
 *   横屏 → rebuildChapterBuffer（以目标章为中心 ±1 窗口，fetch 目标章 + 邻居）
 *
 * 与 Vue 一致：目录/进度条跳转 **始终** 走 goChapter 重建 buffer，
 * 不能只 setGlobalPageIndex（仅适用于翻页跨相邻章）或只 setChapterId（不会重建 buffer）。
 */
import { goChapter as goChapterViaBuffer } from '../../hooks/buffer-rebalance-bridge'
import { useReadingStore } from '../../store/reading-store'

/** 切换中心章到 chapterId（默认章首 pageIndex=0）。 */
export function navigateToChapter(chapterId: number): void {
  const id = Number(chapterId)
  if (!Number.isFinite(id) || id <= 0) {
    return
  }
  if (useReadingStore.getState().chapterId === id) {
    return
  }
  goChapterViaBuffer(id, 0)
}
