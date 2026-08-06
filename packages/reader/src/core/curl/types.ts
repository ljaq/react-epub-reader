/**
 * 仿真翻页（curl）类型定义。
 *
 * 坐标系约定（portrait 单页）：
 * - 页坐标系（page coords）：折角原点（书脊侧）在 x=0，自由边在 x=±pageWidth。
 *   - next（direction=1）：当前页从右缘掀起，页坐标 = viewport 坐标（左缘 0 → 右缘 pageWidth）。
 *   - prev（direction=-1）：上一页从左缘铺入，页坐标 x = -viewportX（页坐标 0 = 屏幕左缘，
 *     静止位 x=+pageWidth 映射到屏幕外左侧）。
 * - y 恒等于 viewport y（0=顶，pageHeight=底）。
 */

export interface CurlPoint {
  x: number
  y: number
}

export interface CurlRectPoints {
  topLeft: CurlPoint
  topRight: CurlPoint
  bottomLeft: CurlPoint
  bottomRight: CurlPoint
}

export interface CurlRect {
  left: number
  top: number
  width: number
  height: number
}

export type CurlSegment = [CurlPoint, CurlPoint]

/** 折角所在的书角：上角 / 下角（由按下点 y 决定） */
export type CurlCorner = 'top' | 'bottom'

/** 翻页方向：1=next（当前页向右掀起），-1=prev（上一页从左铺入） */
export type CurlDirection = 1 | -1

/** 单帧几何结果：渲染层只需按此写 style */
export interface CurlFrame {
  /** 翻页页旋转角（rad，CSS rotate 方向与 page-flip 一致） */
  angle: number
  /** 翻页页锚点（折角点，页坐标） */
  position: CurlPoint
  /** 翻页页可见区域 clip 多边形（页坐标，可能含 null 项，序列化时过滤） */
  flippingClip: (CurlPoint | null)[]
  /** 底层页露出区域 clip 多边形（页坐标，可能含 null 项） */
  bottomClip: (CurlPoint | null)[]
  /** 翻页页旋转后的四角（页坐标） */
  pageRect: CurlRectPoints
  /** 阴影锚点（页坐标，退化帧为 null）与折痕方向角（rad） */
  shadowStart: CurlPoint | null
  shadowAngle: number
  /** 翻页进度 0..1（0=静止，1=完全翻过） */
  progress: number
}
