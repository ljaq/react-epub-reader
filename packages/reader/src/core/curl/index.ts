/**
 * 仿真翻页（curl）公开 API。
 *
 * - CurlCalculation：几何核（page-flip FlipCalculation 移植）
 * - calcCurlFrame：折角点 → 单帧几何结果
 * - render-style：CurlFrame → 样式字符串（翻页页/底层页/双阴影）
 * - fold-point 帮助函数：坐标映射、角部判定、弹簧目标点、阻尼折角点
 */
import { CurlCalculation } from './calculation'
import type { CurlCorner, CurlDirection, CurlFrame, CurlPoint } from './types'

export { CurlCalculation } from './calculation'
export {
  buildBottomPageClipPath,
  buildCreaseShadowStyle,
  buildFlippingBackFaceStyle,
  buildFlippingPageStyle,
  buildInnerShadowStyle,
  buildLandedPageClipPath,
  buildOuterShadowStyle,
  curlToGlobal,
  type CurlShadowStyle
} from './render-style'
export {
  buildStraightBottomClip,
  buildStraightFlapStyle,
  buildStraightShadowStyle,
  computeStraightFold,
  type StraightFoldFrame,
  type StraightShadowKind,
  type StraightShadowStyle
} from './straight-fold'
export type { CurlCorner, CurlDirection, CurlFrame, CurlPoint, CurlRectPoints } from './types'

/**
 * 计算单帧几何。退化输入（页角重合点等）返回 null —— 渲染层跳过该帧（保持上一帧），
 * 与 page-flip Flip.do 的 calc 失败不渲染行为一致。
 */
export function calcCurlFrame(calc: CurlCalculation, localPos: CurlPoint): CurlFrame | null {
  if (!calc.calc(localPos)) {
    return null
  }
  const shadowStart = calc.getShadowStartPoint()
  return {
    angle: calc.getAngle(),
    position: calc.getPosition(),
    flippingClip: calc.getFlippingClipArea(),
    bottomClip: calc.getBottomClipArea(),
    pageRect: calc.getRect(),
    shadowStart,
    shadowAngle: shadowStart ? calc.getShadowAngle() : 0,
    progress: calc.getFlippingProgress()
  }
}

/** 由按下点决定折角书角：上半屏 → 上角，下半屏 → 下角 */
export function resolveCurlCorner(startY: number, pageHeight: number): CurlCorner {
  return startY < pageHeight / 2 ? 'top' : 'bottom'
}

/**
 * viewport 坐标 → 折角页坐标。
 * 统一对角模型后左右滑均在 viewport/next 同构下计算，恒等映射（direction 保留兼容）。
 */
export function toCurlPagePoint(point: CurlPoint, _direction: CurlDirection): CurlPoint {
  void _direction
  return { x: point.x, y: point.y }
}

/**
 * 拖拽折角点域限制（viewport/next 同构坐标）：
 * x ∈ [-(pageWidth-1), pageWidth-1]，左右滑共用（prev 不再做 x 镜像）。
 */
export function clampCurlDragPoint(
  point: CurlPoint,
  _direction: CurlDirection,
  pageWidth: number
): CurlPoint {
  void _direction
  return {
    x: Math.max(-(pageWidth - 1), Math.min(pageWidth - 1, point.x)),
    y: point.y
  }
}

/** 静止位（页坐标）：两方向统一为 x=+pageWidth（next=右缘平铺，prev=屏外左侧藏起） */
export function getCurlRestPoint(corner: CurlCorner, pageWidth: number, pageHeight: number): CurlPoint {
  return { x: pageWidth, y: corner === 'bottom' ? pageHeight : 0 }
}

/** 提交终点（页坐标）：两方向统一为 x=-pageWidth（完全翻到对侧） */
export function getCurlCommitPoint(corner: CurlCorner, pageWidth: number, pageHeight: number): CurlPoint {
  return { x: -pageWidth, y: corner === 'bottom' ? pageHeight : 0 }
}

/**
 * 首末页阻尼折角点（无相邻页时的小幅折角；viewport/next 同构坐标）：
 * dragOffset 已过 applyGlobalDragResistance 衰减；progress 封顶 maxProgress（默认 0.15）。
 * - next（书末）：从右缘小幅揭起，x = pageWidth + dragOffset（dragOffset ≤ 0）
 * - prev（书首）：从左侧外小幅探入，x = -pageWidth + dragOffset（dragOffset ≥ 0）
 */
export function getDampedCurlPoint(
  direction: CurlDirection,
  corner: CurlCorner,
  dragOffset: number,
  fingerY: number,
  pageWidth: number,
  pageHeight: number,
  maxProgress: number = 0.15
): CurlPoint {
  const maxTravel = 2 * pageWidth * maxProgress
  if (direction === 1) {
    const x = Math.max(pageWidth - maxTravel, pageWidth + Math.min(0, dragOffset))
    return { x, y: fingerY }
  }
  const x = Math.min(-pageWidth + maxTravel, -pageWidth + Math.max(0, dragOffset))
  return { x, y: corner === 'bottom' ? Math.min(fingerY, pageHeight) : fingerY }
}

/**
 * 点击翻页动画的起点（页坐标）：从页角内侧 margin 处掀起。
 * 与 page-flip flip() 的 showCorner 起点同款（margin = 页高 1/10）。
 */
/**
 * 点击翻页动画起点（viewport 同构）：
 * - next：右缘内侧小幅揭起 → 再弹簧飞向 -pageWidth；
 * - prev：左缘外侧小幅探入 → 再弹簧飞向 +pageWidth（向右放平）。
 */
export function getCurlClickStartPoint(
  direction: CurlDirection,
  corner: CurlCorner,
  pageWidth: number,
  pageHeight: number
): CurlPoint {
  const margin = pageHeight / 10
  const y = corner === 'bottom' ? pageHeight - margin : margin
  if (direction === 1) {
    return { x: pageWidth - margin, y }
  }
  return { x: -pageWidth + margin, y }
}

/**
 * 弹簧初速度映射：松手速度（viewport x 分量）投影到 起点→终点 路径方向，
 * 归一化为路径参数 t（0→1）的初速度（1/s）。
 */
export function projectVelocityToPath(
  releaseVelocityX: number,
  _direction: CurlDirection,
  from: CurlPoint,
  to: CurlPoint
): number {
  void _direction
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-6) {
    return 0
  }
  // viewport 同构：松手速度 x 与折角点 x 同向
  return (releaseVelocityX * dx) / (len * len)
}

/** 路径插值：t ∈ [0,1] → 折角点 */
export function lerpCurlPoint(from: CurlPoint, to: CurlPoint, t: number): CurlPoint {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}
