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

/** viewport 坐标 → 页坐标：next 恒等；prev 镜像（x 取负） */
export function toCurlPagePoint(point: CurlPoint, direction: CurlDirection): CurlPoint {
  if (direction === -1) {
    return { x: -point.x, y: point.y }
  }
  return { x: point.x, y: point.y }
}

/**
 * 拖拽折角点域限制（页坐标）：
 * - next：折角点不越过右缘（x ≤ pageWidth - 1）
 * - prev：页坐标 x = -viewportX ∈ [-pageWidth, 0]，不越过 -(pageWidth - 1)
 */
export function clampCurlDragPoint(point: CurlPoint, direction: CurlDirection, pageWidth: number): CurlPoint {
  if (direction === 1) {
    return { x: Math.min(point.x, pageWidth - 1), y: point.y }
  }
  return { x: Math.max(point.x, -(pageWidth - 1)), y: point.y }
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
 * 首末页阻尼折角点（无相邻页时的小幅折角）：
 * dragOffset 已过 applyGlobalDragResistance 衰减；progress 封顶 maxProgress（默认 0.15）。
 * - next（书末）：折角点 x = pageWidth + dragOffset（dragOffset ≤ 0）
 * - prev（书首）：折角点 x = -dragOffset（dragOffset ≥ 0）
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
  const x = Math.max(-pageWidth + maxTravel, -Math.max(0, dragOffset))
  return { x, y: corner === 'bottom' ? Math.min(fingerY, pageHeight) : fingerY }
}

/**
 * 点击翻页动画的起点（页坐标）：从页角内侧 margin 处掀起。
 * 与 page-flip flip() 的 showCorner 起点同款（margin = 页高 1/10）。
 */
export function getCurlClickStartPoint(
  // 页坐标系下两方向统一起点（rest 点内缩 margin），参数保留以标明方向语义
  _direction: CurlDirection,
  corner: CurlCorner,
  pageWidth: number,
  pageHeight: number
): CurlPoint {
  void _direction
  const margin = pageHeight / 10
  const rest = getCurlRestPoint(corner, pageWidth, pageHeight)
  return {
    x: rest.x - margin,
    y: corner === 'bottom' ? pageHeight - margin : margin
  }
}

/**
 * 弹簧初速度映射：松手速度（viewport x 分量）投影到 起点→终点 路径方向，
 * 归一化为路径参数 t（0→1）的初速度（1/s）。
 */
export function projectVelocityToPath(
  releaseVelocityX: number,
  direction: CurlDirection,
  from: CurlPoint,
  to: CurlPoint
): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-6) {
    return 0
  }
  // prev 方向页坐标 x 与 viewport x 反号
  const vx = direction === -1 ? -releaseVelocityX : releaseVelocityX
  return (vx * dx) / (len * len)
}

/** 路径插值：t ∈ [0,1] → 折角点 */
export function lerpCurlPoint(from: CurlPoint, to: CurlPoint, t: number): CurlPoint {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}
