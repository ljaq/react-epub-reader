/**
 * 页单元抽象（PageSurface）— 真分页架构的页级解析纯函数，零 React 依赖。
 *
 * phase-10：覆盖模式（PagedReader）消费；下期仿真翻页（page-flip）以 PageSurface
 * 作为页级渲染接口的接入点。
 *
 * 页解析复用 core/chapter-buffer 的 globalToLocal 换算：globalPageIndex 是
 * buffer 坐标系下的全局页码，PageSurface 把它解析为「哪章的哪一页」。
 */
import { globalToLocal, type ChapterBuffer } from '../chapter-buffer'

/** 页单元：buffer 坐标系下唯一标识一页（可跨章）。 */
export interface PageSurface {
  /** `${chapterId}:${localPageIndex}`，可作 React key / DOM data 属性 */
  key: string
  chapterId: number
  /** 章内页码 */
  localPageIndex: number
  /** 全局页码（buffer 坐标系） */
  globalPageIndex: number
}

/**
 * globalPageIndex → PageSurface。
 * 越界（<0 或 ≥ totalPages）或 buffer 为空时返回 null —— 对应「无相邻页」
 * （首末页阻尼）场景，调用方据此决定是否创建相邻页克隆。
 */
export function resolvePageSurface(
  globalPageIndex: number,
  buffer: ChapterBuffer
): PageSurface | null {
  if (!buffer.order.length) {
    return null
  }
  const totalPages = Math.max(1, buffer.totalPages || 1)
  const safeGlobal = Math.round(Number(globalPageIndex))
  if (!Number.isFinite(safeGlobal) || safeGlobal < 0 || safeGlobal > totalPages - 1) {
    return null
  }
  const local = globalToLocal(safeGlobal, buffer)
  return {
    key: `${local.chapterId}:${local.pageIndex}`,
    chapterId: local.chapterId,
    localPageIndex: local.pageIndex,
    globalPageIndex: safeGlobal
  }
}

/**
 * 求相邻页单元。direction=1 下一页，-1 上一页。
 * 首末页（无相邻）返回 null —— 覆盖动画据此走阻尼分支（不建克隆）。
 */
export function resolveAdjacentPageSurface(
  surface: PageSurface,
  direction: 1 | -1,
  buffer: ChapterBuffer
): PageSurface | null {
  return resolvePageSurface(surface.globalPageIndex + direction, buffer)
}

/** 两页单元是否同章（克隆源选择：同章取规范流本体，跨章取隐藏测量流）。 */
export function isSameChapterPage(a: PageSurface, b: PageSurface): boolean {
  return Number(a.chapterId) === Number(b.chapterId)
}
