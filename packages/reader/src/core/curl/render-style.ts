/**
 * 仿真翻页渲染样式构建 — 移植自 page-flip@2.0.7
 * src/Page/HTMLPage.ts drawSoft + src/Render/HTMLRender.ts drawOuterShadow/drawInnerShadow
 * （MIT License，Copyright (c) 2020 Nodlik）。
 *
 * 全部为纯函数：输入 CurlFrame + 页几何，输出要写入 DOM 的 style 字符串/数值，
 * 渲染层（useCurlMotionBridge）只负责写入，不做任何计算。
 *
 * 坐标映射（portrait 单页，pageLeftEdge=0）：
 * - convertToGlobal: next → 恒等；prev → x 取负（镜像）；
 * - 页坐标 → 元素局部坐标：next → p - position；prev → (-p.x + position.x, p.y - position.y)；
 * - 局部点多乘一次 getRotatedPoint(g, origin, angle)：与 CSS rotate(angle)（transform-origin 0 0
 *   或显式 origin）复合后恰使屏幕落点 = 页坐标点（page-flip 的旋转约定见 geometry.ts）。
 */
import { getRotatedPoint } from './geometry'
import type { CurlDirection, CurlFrame, CurlPoint } from './types'

/** 折角点页坐标 → 屏幕（viewport）坐标 */
export function curlToGlobal(point: CurlPoint, direction: CurlDirection): CurlPoint {
  if (direction === -1) {
    return { x: -point.x, y: point.y }
  }
  return { x: point.x, y: point.y }
}

function pointsToPolygon(points: CurlPoint[]): string {
  const body = points.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(', ')
  return `polygon(${body})`
}

/**
 * 翻页页样式：clip-path + transform（transform-origin 必须是 0 0，由 CSS 保证）。
 *
 * 锚点 = 活动角（getActiveCorner：next=rect.topLeft / prev=rect.topRight），
 * 即原页左上角/右上角旋转后的落点——元素内容随折痕旋转后与原版逐位一致。
 * 注意不能用折角点 position 作锚点：那会让内容平移 position-activeCorner 的偏移，
 * clip 区域只剩页背景（"翻页页无文字" bug 的根因）。
 * 局部多边形 = R(angle)·(p - anchor)（prev 镜像），transform = translate(anchor') rotate(angle)。
 */
export function buildFlippingPageStyle(
  frame: CurlFrame,
  direction: CurlDirection
): { transform: string; clipPath: string } {
  const anchor = direction === 1 ? frame.pageRect.topLeft : frame.pageRect.topRight
  const points: CurlPoint[] = []
  for (const p of frame.flippingClip) {
    if (p === null) continue
    const local =
      direction === -1
        ? { x: -p.x + anchor.x, y: p.y - anchor.y }
        : { x: p.x - anchor.x, y: p.y - anchor.y }
    points.push(getRotatedPoint(local, { x: 0, y: 0 }, frame.angle))
  }
  const globalPos = curlToGlobal(anchor, direction)
  return {
    transform: `translate3d(${globalPos.x.toFixed(2)}px, ${globalPos.y.toFixed(2)}px, 0) rotate(${frame.angle}rad)`,
    clipPath: pointsToPolygon(points)
  }
}

/**
 * 翻页页「背面」样式（掌阅级纸张背面，phase-14 增强，仅 next/翻出方向使用）：
 * 正面 soft 模型只把正面内容旋转进 flap 区；背面效果 = 整个 flap 元素沿折痕
 * 做镜像反射（det<0，CSS matrix 表达），文字随折角倾斜且反向，
 * 配合纸色半透明罩（.paged-reader__curl-backface-tint）模拟纸张背面透光。
 *
 * 数学：折痕 = 过 shadowStart、方向角 shadowAngle 的直线。
 * 页坐标反射 F(q) = A·q + t，A = [[cos2β, sin2β],[sin2β, -cos2β]]，t = s - A·s（A²=I）。
 * 元素 transform = matrix(A,t)（prev 方向整体 x 镜像），
 * clip 多边形 = F(flippingClip) —— 不变量：T(F(p)) ≡ p（屏幕落点不变，仅内容镜像）。
 * shadowStart 为 null 的退化帧返回 null（桥接跳过该帧）。
 *
 * 注意：prev（铺入）方向不要用本函数 —— 其坐标约定下 F 会把 clip 映到页框外；
 * prev 上一页正面朝上转入，用 buildFlippingPageStyle 正面渲染即可。
 */
export function buildFlippingBackFaceStyle(
  frame: CurlFrame,
  direction: CurlDirection
): { transform: string; clipPath: string } | null {
  const s = frame.shadowStart
  if (!s) {
    return null
  }
  const beta = frame.shadowAngle
  const a = Math.cos(2 * beta)
  const sn = Math.sin(2 * beta)
  const tx = s.x - (a * s.x + sn * s.y)
  const ty = s.y - (sn * s.x - a * s.y)
  // prev：页坐标 → viewport 镜像 M=diag(-1,1)；A_v = M·A·M，t_v = M·t
  const m = direction === -1 ? -1 : 1

  const points: CurlPoint[] = []
  for (const p of frame.flippingClip) {
    if (p === null) continue
    const x = a * p.x + sn * p.y + tx
    const y = sn * p.x - a * p.y + ty
    points.push(m === -1 ? { x: -x, y } : { x, y })
  }
  if (points.length < 3) {
    return null
  }
  return {
    transform: `matrix(${a.toFixed(6)}, ${(m * sn).toFixed(6)}, ${(m * sn).toFixed(6)}, ${(-a).toFixed(6)}, ${(m * tx).toFixed(2)}, ${ty.toFixed(2)})`,
    clipPath: pointsToPolygon(points)
  }
}

/**
 * 底层页 clip-path：next 时底层页（下一页克隆）按 bottomClip 裁剪（静止、无旋转，局部=页坐标）；
 * prev 时底层页（当前页）完整显示不裁剪（返回 null）。
 */
export function buildBottomPageClipPath(frame: CurlFrame, direction: CurlDirection): string | null {
  if (direction === -1) {
    return null
  }
  const points: CurlPoint[] = []
  for (const p of frame.bottomClip) {
    if (p === null) continue
    points.push(p)
  }
  if (points.length < 3) {
    return null
  }
  return pointsToPolygon(points)
}

export interface CurlShadowStyle {
  width: number
  height: number
  transform: string
  transformOrigin: string
  background: string
  clipPath: string
}

interface ShadowBuildInput {
  /** 阴影锚点（页坐标） */
  shadowPos: CurlPoint
  /** 阴影方向角（rad，calc.getShadowAngle()） */
  shadowAngle: number
  /** 阴影带宽（px） */
  width: number
  /** 阴影不透明度 0..1 */
  opacity: number
  /** clip 参照矩形（outer=页矩形四角；inner=翻页页旋转后四角），页坐标 */
  clipRect: [CurlPoint, CurlPoint, CurlPoint, CurlPoint]
  /** 元素高度（2×pageHeight） */
  height: number
}

/**
 * 阴影元素样式（outer/inner 共用数学，参数不同）：
 * 元素为 width×height 的渐变带，transform-origin=(shadowTranslate, 100)，
 * 平移使原点落在锚点、按 angle+3π/2 旋转（带宽方向垂直于折痕），
 * clip 多边形把阴影带裁到参照矩形内。
 */
function buildShadowStyle(input: ShadowBuildInput, direction: CurlDirection, translateX: number, gradient: string): CurlShadowStyle {
  const { shadowPos, shadowAngle, width, opacity, clipRect, height } = input
  const angle = shadowAngle + (3 * Math.PI) / 2
  const globalPos = curlToGlobal(shadowPos, direction)

  const points: CurlPoint[] = []
  for (const p of clipRect) {
    const local =
      direction === -1
        ? { x: -p.x + shadowPos.x, y: p.y - shadowPos.y }
        : { x: p.x - shadowPos.x, y: p.y - shadowPos.y }
    points.push(getRotatedPoint(local, { x: translateX, y: 100 }, angle))
  }

  return {
    width,
    height,
    transform: `translate3d(${(globalPos.x - translateX).toFixed(2)}px, ${(globalPos.y - 100).toFixed(2)}px, 0) rotate(${angle}rad)`,
    transformOrigin: `${translateX.toFixed(2)}px 100px`,
    background: gradient.replace('$OPACITY', opacity.toFixed(3)),
    clipPath: pointsToPolygon(points)
  }
}

/** 底层页外阴影（投在底层页上，clip 参照 = 页矩形） */
export function buildOuterShadowStyle(
  frame: CurlFrame,
  direction: CurlDirection,
  pageWidth: number,
  pageHeight: number
): CurlShadowStyle | null {
  if (!frame.shadowStart) {
    return null
  }
  const width = pageWidth * 0.75 * frame.progress
  const opacity = 1 - frame.progress
  return buildShadowStyle(
    {
      shadowPos: frame.shadowStart,
      shadowAngle: frame.shadowAngle,
      width,
      opacity,
      clipRect: [
        { x: 0, y: 0 },
        { x: pageWidth, y: 0 },
        { x: pageWidth, y: pageHeight },
        { x: 0, y: pageHeight }
      ],
      height: pageHeight * 2
    },
    direction,
    direction === -1 ? width : 0,
    direction === 1
      ? 'linear-gradient(to right, rgba(0, 0, 0, $OPACITY), rgba(0, 0, 0, 0))'
      : 'linear-gradient(to left, rgba(0, 0, 0, $OPACITY), rgba(0, 0, 0, 0))'
  )
}

/** 翻页页内阴影（折痕背光侧，clip 参照 = 翻页页旋转后矩形；双峰渐变模拟折痕光照） */
export function buildInnerShadowStyle(
  frame: CurlFrame,
  direction: CurlDirection,
  pageWidth: number,
  pageHeight: number
): CurlShadowStyle | null {
  if (!frame.shadowStart) {
    return null
  }
  const width = (pageWidth * 0.75 * frame.progress * 3) / 4
  const opacity = 1 - frame.progress
  return buildShadowStyle(
    {
      shadowPos: frame.shadowStart,
      shadowAngle: frame.shadowAngle,
      width,
      opacity,
      clipRect: [
        frame.pageRect.topLeft,
        frame.pageRect.topRight,
        frame.pageRect.bottomRight,
        frame.pageRect.bottomLeft
      ],
      height: pageHeight * 2
    },
    direction,
    direction === 1 ? width : 0,
    direction === 1
      ? 'linear-gradient(to left, rgba(0, 0, 0, $OPACITY) 5%, rgba(0, 0, 0, 0.05) 15%, rgba(0, 0, 0, $OPACITY) 35%, rgba(0, 0, 0, 0) 100%)'
      : 'linear-gradient(to right, rgba(0, 0, 0, $OPACITY) 5%, rgba(0, 0, 0, 0.05) 15%, rgba(0, 0, 0, $OPACITY) 35%, rgba(0, 0, 0, 0) 100%)'
  )
}
