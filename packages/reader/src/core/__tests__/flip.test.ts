/**
 * core/flip 覆盖动画纯函数单测（phase-10, phase-13）。
 *
 * 覆盖：
 * - getCoverMovingTranslateX：next/prev/阻尼三分支的位移映射与 clamp
 * - getCoverCommitTargetX / getCoverRestingX：动画终点
 * - getCoverStaticParallaxX：视差静态页位移
 * - getCoverOverlayOpacity：静态页遮罩透明度
 * - resolveCoverLayers：动/静页层级分配（含首末页阻尼 staticPage=null）
 * - resolveCoverDragTurn：提交/回弹判定（复用全局阈值语义）
 */
import { describe, it, expect } from 'vitest'
import {
  getCoverCommitTargetX,
  getCoverMovingTranslateX,
  getCoverOverlayOpacity,
  getCoverRestingX,
  getCoverStaticParallaxX,
  resolveCoverDragTurn,
  resolveCoverLayers
} from '../flip'
import type { PageSurface } from '../pages'

const PAGE_WIDTH = 360

const currentPage: PageSurface = {
  key: '10:1',
  chapterId: 10,
  localPageIndex: 1,
  globalPageIndex: 1
}

const nextPage: PageSurface = {
  key: '10:2',
  chapterId: 10,
  localPageIndex: 2,
  globalPageIndex: 2
}

const prevPage: PageSurface = {
  key: '10:0',
  chapterId: 10,
  localPageIndex: 0,
  globalPageIndex: 0
}

describe('getCoverMovingTranslateX', () => {
  it('next（左滑看下一页）：当前页向左滑出，dragOffset 直通并 clamp 到 [-pageWidth, 0]', () => {
    expect(
      getCoverMovingTranslateX({ direction: 1, dragOffset: -120, pageWidth: PAGE_WIDTH, hasAdjacent: true })
    ).toBe(-120)
    // 正值（回拉）clamp 到 0，不允许当前页向右露出左侧
    expect(
      getCoverMovingTranslateX({ direction: 1, dragOffset: 40, pageWidth: PAGE_WIDTH, hasAdjacent: true })
    ).toBe(0)
    // 超页宽 clamp 到 -pageWidth
    expect(
      getCoverMovingTranslateX({ direction: 1, dragOffset: -999, pageWidth: PAGE_WIDTH, hasAdjacent: true })
    ).toBe(-PAGE_WIDTH)
  })

  it('prev（右滑看上一页）：上一页从左侧滑入，-pageWidth+dx 并 clamp', () => {
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: 120, pageWidth: PAGE_WIDTH, hasAdjacent: true })
    ).toBe(-PAGE_WIDTH + 120)
    // 起点（dx=0）：上一页完全藏在左侧
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: 0, pageWidth: PAGE_WIDTH, hasAdjacent: true })
    ).toBe(-PAGE_WIDTH)
    // 负值（回推）clamp 到 -pageWidth
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: -40, pageWidth: PAGE_WIDTH, hasAdjacent: true })
    ).toBe(-PAGE_WIDTH)
    // 超页宽 clamp 到 0（完全盖住）
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: 999, pageWidth: PAGE_WIDTH, hasAdjacent: true })
    ).toBe(0)
  })

  it('prev：上一页从最左侧开始，跟随 dragOffset 向右滑入（phase-13 不再锚定手指）', () => {
    // 右滑 30：移动 30，translateX = -pageWidth + 30
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: 30, pageWidth: PAGE_WIDTH, hasAdjacent: true, dragStartX: 300 })
    ).toBe(-PAGE_WIDTH + 30)
    // 刚按下未移动（dx=0）：仍在最左侧 -pageWidth（不再从手指位置出现）
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: 0, pageWidth: PAGE_WIDTH, hasAdjacent: true, dragStartX: 300 })
    ).toBe(-PAGE_WIDTH)
    // 手指滑到屏幕右缘：完全盖住（clamp 0）
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: PAGE_WIDTH, pageWidth: PAGE_WIDTH, hasAdjacent: true, dragStartX: 300 })
    ).toBe(0)
    // 手指回拉：藏回左侧（clamp -pageWidth）
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: -400, pageWidth: PAGE_WIDTH, hasAdjacent: true, dragStartX: 300 })
    ).toBe(-PAGE_WIDTH)
  })

  it('首末页无相邻页：当前页整体阻尼位移（dragOffset 已过阻尼衰减）', () => {
    expect(
      getCoverMovingTranslateX({ direction: 1, dragOffset: -28, pageWidth: PAGE_WIDTH, hasAdjacent: false })
    ).toBe(-28)
    expect(
      getCoverMovingTranslateX({ direction: -1, dragOffset: 35, pageWidth: PAGE_WIDTH, hasAdjacent: false })
    ).toBe(35)
  })

  it('pageWidth ≤ 0 → 0（测量前兜底）', () => {
    expect(
      getCoverMovingTranslateX({ direction: 1, dragOffset: -120, pageWidth: 0, hasAdjacent: true })
    ).toBe(0)
  })
})

describe('动画终点', () => {
  it('getCoverCommitTargetX：next 滑出到 -pageWidth，prev 滑入到 0', () => {
    expect(getCoverCommitTargetX(1, PAGE_WIDTH)).toBe(-PAGE_WIDTH)
    expect(getCoverCommitTargetX(-1, PAGE_WIDTH)).toBe(0)
  })

  it('getCoverRestingX：next 静止在 0，prev 静止在 -pageWidth', () => {
    expect(getCoverRestingX(1, PAGE_WIDTH)).toBe(0)
    expect(getCoverRestingX(-1, PAGE_WIDTH)).toBe(-PAGE_WIDTH)
  })
})

describe('resolveCoverLayers 层级计划', () => {
  it('next：moving=当前页滑出，static=下一页', () => {
    const plan = resolveCoverLayers({
      direction: 1,
      currentPage,
      adjacentPage: nextPage,
      dragOffset: -100,
      pageWidth: PAGE_WIDTH
    })
    expect(plan.movingPage).toBe(currentPage)
    expect(plan.staticPage).toBe(nextPage)
    expect(plan.movingTranslateX).toBe(-100)
    expect(plan.movingOnTop).toBe(true)
  })

  it('prev：moving=上一页滑入，static=当前页', () => {
    const plan = resolveCoverLayers({
      direction: -1,
      currentPage,
      adjacentPage: prevPage,
      dragOffset: 100,
      pageWidth: PAGE_WIDTH
    })
    expect(plan.movingPage).toBe(prevPage)
    expect(plan.staticPage).toBe(currentPage)
    expect(plan.movingTranslateX).toBe(-PAGE_WIDTH + 100)
  })

  it('首末页无相邻页：moving=当前页，static=null（露出底色）', () => {
    const atBookEnd = resolveCoverLayers({
      direction: 1,
      currentPage,
      adjacentPage: null,
      dragOffset: -30,
      pageWidth: PAGE_WIDTH
    })
    expect(atBookEnd.movingPage).toBe(currentPage)
    expect(atBookEnd.staticPage).toBeNull()
    expect(atBookEnd.movingTranslateX).toBe(-30)

    const atBookStart = resolveCoverLayers({
      direction: -1,
      currentPage,
      adjacentPage: null,
      dragOffset: 30,
      pageWidth: PAGE_WIDTH
    })
    expect(atBookStart.movingPage).toBe(currentPage)
    expect(atBookStart.staticPage).toBeNull()
    expect(atBookStart.movingTranslateX).toBe(30)
  })
})

describe('resolveCoverDragTurn 提交/回弹判定', () => {
  it('位移 ≥ 阈值(40) 且方向内有页 → 提交', () => {
    expect(resolveCoverDragTurn(1, 5, -40)).toBe('next-page')
    expect(resolveCoverDragTurn(1, 5, -120)).toBe('next-page')
    expect(resolveCoverDragTurn(1, 5, 40)).toBe('prev-page')
  })

  it('位移 < 阈值 → 回弹', () => {
    expect(resolveCoverDragTurn(1, 5, -39)).toBe('stay')
    expect(resolveCoverDragTurn(1, 5, 0)).toBe('stay')
    expect(resolveCoverDragTurn(1, 5, 39)).toBe('stay')
  })

  it('首末页边界不越界提交', () => {
    expect(resolveCoverDragTurn(0, 5, 120)).toBe('stay')
    expect(resolveCoverDragTurn(4, 5, -120)).toBe('stay')
  })
})

describe('getCoverStaticParallaxX 视差静态页位移', () => {
  it('左滑：底层下一页从 pageWidth/4 滑入到 0', () => {
    expect(getCoverStaticParallaxX(0, PAGE_WIDTH)).toBe(PAGE_WIDTH / 4)
    expect(getCoverStaticParallaxX(-PAGE_WIDTH / 2, PAGE_WIDTH)).toBe(PAGE_WIDTH / 8)
    expect(getCoverStaticParallaxX(-PAGE_WIDTH, PAGE_WIDTH)).toBe(0)
  })

  it('右滑：底层当前页从 0 滑出到 pageWidth/4', () => {
    expect(getCoverStaticParallaxX(-PAGE_WIDTH, PAGE_WIDTH)).toBe(0)
    expect(getCoverStaticParallaxX(-PAGE_WIDTH / 2, PAGE_WIDTH)).toBe(PAGE_WIDTH / 8)
    expect(getCoverStaticParallaxX(0, PAGE_WIDTH)).toBe(PAGE_WIDTH / 4)
  })
})

describe('getCoverOverlayOpacity 遮罩透明度', () => {
  it('左滑：遮罩从 1 渐隐到 0', () => {
    expect(getCoverOverlayOpacity(0, PAGE_WIDTH, 1)).toBe(1)
    expect(getCoverOverlayOpacity(-PAGE_WIDTH / 2, PAGE_WIDTH, 1)).toBe(0.5)
    expect(getCoverOverlayOpacity(-PAGE_WIDTH, PAGE_WIDTH, 1)).toBe(0)
  })

  it('右滑：上一页逼近，遮罩从 0 渐强到 1', () => {
    expect(getCoverOverlayOpacity(-PAGE_WIDTH, PAGE_WIDTH, -1)).toBe(0)
    expect(getCoverOverlayOpacity(-PAGE_WIDTH / 2, PAGE_WIDTH, -1)).toBe(0.5)
    expect(getCoverOverlayOpacity(0, PAGE_WIDTH, -1)).toBe(1)
  })

  it('clamp 到 [0, 1]', () => {
    expect(getCoverOverlayOpacity(-999, PAGE_WIDTH, 1)).toBe(0)
    expect(getCoverOverlayOpacity(999, PAGE_WIDTH, -1)).toBe(1)
  })

  it('pageWidth ≤ 0 → 0', () => {
    expect(getCoverOverlayOpacity(-100, 0, 1)).toBe(0)
  })
})
