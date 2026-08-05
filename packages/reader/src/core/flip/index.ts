/**
 * 覆盖翻页动画纯函数 — 零 React 依赖。
 *
 * phase-10 掌阅级覆盖模式：
 * - 左滑看下一页（next）：下一页静止在底层，当前页作为顶层跟随手指向左滑出。
 * - 右滑看上一页（prev）：当前页静止在底层，上一页作为顶层从左侧滑入盖住当前页。
 * - 首末页无相邻页：不建克隆，当前页整体做阻尼位移露出底色。
 *
 * 提交/回弹判定复用 core/pagination 的 resolveGlobalDragTurn（阈值 DRAG_THRESHOLD=40），
 * 与平移模式手感一致，不发明新阈值。
 */
import {
  resolveGlobalDragTurn,
  type DragTurnResult
} from '../pagination'
import type { PageSurface } from '../pages'

/** 覆盖方向：1=下一页（左滑），-1=上一页（右滑）。 */
export type CoverDirection = 1 | -1

export interface CoverLayerPlan {
  direction: CoverDirection
  /** 顶层移动页：next=当前页滑出；prev=上一页滑入；无相邻页=当前页阻尼位移 */
  movingPage: PageSurface
  /** 底层静止页：next=下一页 / prev=当前页；首末页阻尼时为 null */
  staticPage: PageSurface | null
  /** 移动页 translateX（由 dragOffset 映射，已 clamp） */
  movingTranslateX: number
  /** 移动页是否压在最顶层（覆盖模式恒 true，字段为下期仿真翻页预留） */
  movingOnTop: boolean
}

export interface CoverTranslateInput {
  direction: CoverDirection
  /** 手势位移（已过 applyGlobalDragResistance 阻尼处理） */
  dragOffset: number
  pageWidth: number
  /** 是否有相邻页（false=首末页阻尼分支） */
  hasAdjacent: boolean
  /**
   * 横向拖拽起点 clientX（右滑前缘锚定手指：上一页从手指位置出现并跟随，
   * 对齐掌阅）。缺省 0 = 按位移增量从屏幕左缘滑入（旧行为）。
   */
  dragStartX?: number
}

/**
 * 移动页位移映射：
 * - next + 有相邻页：当前页向左滑出，translateX = clamp(dragOffset, -pageWidth, 0)。
 * - prev + 有相邻页：上一页前缘（右缘）锚定手指 clientX = dragStartX + dragOffset，
 *   translateX = clamp(-pageWidth + clientX, -pageWidth, 0)——手指在哪页面前缘就在哪。
 * - 无相邻页（首末页阻尼）：当前页整体跟随阻尼位移，translateX = dragOffset。
 */
export function getCoverMovingTranslateX(input: CoverTranslateInput): number {
  const { direction, dragOffset, pageWidth, hasAdjacent, dragStartX = 0 } = input
  if (pageWidth <= 0) {
    return 0
  }
  if (!hasAdjacent) {
    return dragOffset
  }
  if (direction > 0) {
    return Math.max(-pageWidth, Math.min(0, dragOffset))
  }
  return Math.min(0, Math.max(-pageWidth, -pageWidth + Math.max(0, dragStartX + dragOffset)))
}

/** 动画提交终点：next → 当前页滑出到 -pageWidth；prev → 上一页滑入到 0。 */
export function getCoverCommitTargetX(direction: CoverDirection, pageWidth: number): number {
  return direction > 0 ? -Math.max(0, pageWidth) : 0
}

/** 回弹终点（动画前的静止位）：next → 0；prev → -pageWidth（上一页藏回左侧）。 */
export function getCoverRestingX(direction: CoverDirection, pageWidth: number): number {
  return direction > 0 ? 0 : -Math.max(0, pageWidth)
}

export interface ResolveCoverLayersInput {
  direction: CoverDirection
  currentPage: PageSurface
  /** 相邻页单元；首末页为 null（阻尼分支） */
  adjacentPage: PageSurface | null
  dragOffset: number
  pageWidth: number
  /** 右滑前缘锚定手指起点 clientX（透传 getCoverMovingTranslateX，缺省 0） */
  dragStartX?: number
}

/**
 * 解析覆盖动画的层级计划：谁动、谁静、位移多少。
 * z 序约定（渲染层实现）：staticPage 在底层（z=1），movingPage 在顶层（z=2）。
 */
export function resolveCoverLayers(input: ResolveCoverLayersInput): CoverLayerPlan {
  const { direction, currentPage, adjacentPage, dragOffset, pageWidth, dragStartX } = input
  const hasAdjacent = adjacentPage !== null
  const movingPage = direction > 0 ? currentPage : adjacentPage ?? currentPage
  const staticPage = direction > 0 ? adjacentPage : hasAdjacent ? currentPage : null
  return {
    direction,
    movingPage,
    staticPage,
    movingTranslateX: getCoverMovingTranslateX({ direction, dragOffset, pageWidth, hasAdjacent, dragStartX }),
    movingOnTop: true
  }
}

/**
 * 覆盖动画提交/回弹判定 — 包装 resolveGlobalDragTurn，语义化供覆盖层调用。
 * 返回 'next-page'/'prev-page' 表示提交（补间到终点后 setGlobalPageIndex±1），
 * 'stay' 表示回弹（补间回静止位，页码不变）。
 */
export function resolveCoverDragTurn(
  globalPageIndex: number,
  totalPages: number,
  deltaX: number,
  threshold: number = 40
): DragTurnResult {
  return resolveGlobalDragTurn(globalPageIndex, totalPages, deltaX, threshold)
}
