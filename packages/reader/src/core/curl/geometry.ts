/**
 * 仿真翻页几何工具 — 移植自 page-flip@2.0.7 src/Helper.ts（MIT License，
 * Copyright (c) 2020 Nodlik，https://github.com/Nodlik/page-flip），
 * 仅保留 FlipCalculation 所需的纯函数，改为独立导出。
 */
import type { CurlPoint, CurlRect, CurlSegment } from './types'

export function getDistanceBetweenTwoPoint(point1: CurlPoint | null, point2: CurlPoint | null): number {
  // 与原版一致：任一点为 null 时返回 Infinity（调用方据此走 "距离足够大" 分支）
  if (point1 === null || point2 === null) {
    return Infinity
  }

  return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2))
}

export function getAngleBetweenTwoLine(line1: CurlSegment, line2: CurlSegment): number {
  const A1 = line1[0].y - line1[1].y
  const A2 = line2[0].y - line2[1].y

  const B1 = line1[1].x - line1[0].x
  const B2 = line2[1].x - line2[0].x

  return Math.acos((A1 * A2 + B1 * B2) / (Math.sqrt(A1 * A1 + B1 * B1) * Math.sqrt(A2 * A2 + B2 * B2)))
}

export function pointInRect(rect: CurlRect, pos: CurlPoint | null): CurlPoint | null {
  if (pos === null) {
    return null
  }

  if (pos.x >= rect.left && pos.x <= rect.width + rect.left && pos.y >= rect.top && pos.y <= rect.top + rect.height) {
    return pos
  }
  return null
}

/**
 * 旋转变换（与 page-flip GetRotatedPoint 逐字一致）。
 * 注意：在 y 向下的屏幕坐标系中，正 angle 为逆时针（等价于 CSS rotate(-angle)），
 * 渲染层依赖这一约定（clip 多边形 = R(+angle)·(p - position)，元素 transform 用 rotate(angle)）。
 */
export function getRotatedPoint(transformedPoint: CurlPoint, startPoint: CurlPoint, angle: number): CurlPoint {
  return {
    x: transformedPoint.x * Math.cos(angle) + transformedPoint.y * Math.sin(angle) + startPoint.x,
    y: transformedPoint.y * Math.cos(angle) - transformedPoint.x * Math.sin(angle) + startPoint.y
  }
}

/** 将点限制在以 startPoint 为圆心、radius 为半径的圆内（沿线段取交点） */
export function limitPointToCircle(startPoint: CurlPoint, radius: number, limitedPoint: CurlPoint): CurlPoint {
  if (getDistanceBetweenTwoPoint(startPoint, limitedPoint) <= radius) {
    return limitedPoint
  }

  const a = startPoint.x
  const b = startPoint.y
  const n = limitedPoint.x
  const m = limitedPoint.y

  let x = Math.sqrt((Math.pow(radius, 2) * Math.pow(a - n, 2)) / (Math.pow(a - n, 2) + Math.pow(b - m, 2))) + a
  if (limitedPoint.x < 0) {
    x *= -1
  }

  let y = ((x - a) * (b - m)) / (a - n) + b
  if (a - n + b === 0) {
    y = radius
  }

  return { x, y }
}

/** 两直线交点（在 rectBorder 内才返回）；平行/重合时返回 null 或抛错（调用方需 try/catch） */
export function getIntersectBetweenTwoLine(one: CurlSegment, two: CurlSegment): CurlPoint | null {
  const A1 = one[0].y - one[1].y
  const A2 = two[0].y - two[1].y

  const B1 = one[1].x - one[0].x
  const B2 = two[1].x - two[0].x

  const C1 = one[0].x * one[1].y - one[1].x * one[0].y
  const C2 = two[0].x * two[1].y - two[1].x * two[0].y

  const det1 = A1 * C2 - A2 * C1
  const det2 = B1 * C2 - B2 * C1

  const x = -((C1 * B2 - C2 * B1) / (A1 * B2 - A2 * B1))
  const y = -((A1 * C2 - A2 * C1) / (A1 * B2 - A2 * B1))

  if (isFinite(x) && isFinite(y)) {
    return { x, y }
  }
  if (Math.abs(det1 - det2) < 0.1) {
    throw new Error('Segment included')
  }

  return null
}

export function getIntersectBetweenTwoSegment(rectBorder: CurlRect, one: CurlSegment, two: CurlSegment): CurlPoint | null {
  return pointInRect(rectBorder, getIntersectBetweenTwoLine(one, two))
}
