/**
 * 仿真翻页几何核 — 移植自 page-flip@2.0.7 src/Flip/FlipCalculation.ts
 * （MIT License，Copyright (c) 2020 Nodlik，https://github.com/Nodlik/page-flip）。
 *
 * 移植说明：
 * - 逐行对齐原版算法；FlipDirection.FORWARD/BACK → CurlDirection 1/-1，
 *   FlipCorner.TOP/BOTTOM → 'top'/'bottom'；
 * - 输入输出均为「页坐标系」（见 types.ts 约定）：next 时页坐标=viewport 坐标，
 *   prev 时页坐标 x = -viewportX（镜像）；
 * - 与原版一致，clip 多边形数组可能包含 null 项（退化帧），由序列化层过滤；
 * - calc() 内部 try/catch，退化输入返回 false，调用方跳过该帧。
 */
import {
  getAngleBetweenTwoLine,
  getDistanceBetweenTwoPoint,
  getIntersectBetweenTwoSegment,
  limitPointToCircle
} from './geometry'
import type { CurlCorner, CurlDirection, CurlPoint, CurlRect, CurlRectPoints } from './types'

export class CurlCalculation {
  /** 计算出的翻页页旋转角（内部值；getAngle 按方向做符号调整） */
  private angle!: number
  /** 折角点位置（页坐标） */
  private position!: CurlPoint

  private rect!: CurlRectPoints

  /** 翻页页与书边界的交点 */
  private topIntersectPoint: CurlPoint | null = null
  private sideIntersectPoint: CurlPoint | null = null
  private bottomIntersectPoint: CurlPoint | null = null

  private readonly pageWidth: number
  private readonly pageHeight: number
  private readonly direction: CurlDirection
  private readonly corner: CurlCorner

  constructor(
    direction: CurlDirection,
    corner: CurlCorner,
    pageWidth: number,
    pageHeight: number
  ) {
    this.direction = direction
    this.corner = corner
    this.pageWidth = pageWidth
    this.pageHeight = pageHeight
  }

  /**
   * 主计算方法
   * @param localPos 折角点坐标（相对活动页，页坐标系）
   * @returns 计算是否成功（退化输入返回 false）
   */
  public calc(localPos: CurlPoint): boolean {
    try {
      this.position = this.calcAngleAndPosition(localPos)
      this.calculateIntersectPoint(this.position)
      return true
    } catch {
      return false
    }
  }

  /** 翻页页（活动页）的可见区域多边形（页坐标，可能含 null 项） */
  public getFlippingClipArea(): (CurlPoint | null)[] {
    const result: (CurlPoint | null)[] = []
    let clipBottom = false

    result.push(this.rect.topLeft)
    result.push(this.topIntersectPoint)

    if (this.sideIntersectPoint === null) {
      clipBottom = true
    } else {
      result.push(this.sideIntersectPoint)
      if (this.bottomIntersectPoint === null) {
        clipBottom = false
      }
    }

    result.push(this.bottomIntersectPoint)

    if (clipBottom || this.corner === 'bottom') {
      result.push(this.rect.bottomLeft)
    }

    return result
  }

  /** 底层页露出区域多边形（页坐标，可能含 null 项） */
  public getBottomClipArea(): (CurlPoint | null)[] {
    const result: (CurlPoint | null)[] = []

    result.push(this.topIntersectPoint)

    if (this.corner === 'top') {
      result.push({ x: this.pageWidth, y: 0 })
    } else {
      if (this.topIntersectPoint !== null) {
        result.push({ x: this.pageWidth, y: 0 })
      }
      result.push({ x: this.pageWidth, y: this.pageHeight })
    }

    if (this.sideIntersectPoint !== null) {
      if (getDistanceBetweenTwoPoint(this.sideIntersectPoint, this.topIntersectPoint) >= 10) {
        result.push(this.sideIntersectPoint)
      }
    } else {
      if (this.corner === 'top') {
        result.push({ x: this.pageWidth, y: this.pageHeight })
      }
    }

    result.push(this.bottomIntersectPoint)
    result.push(this.topIntersectPoint)

    return result
  }

  /** 翻页页旋转角（rad；next 方向取内部值的相反数，与 page-flip getAngle 一致） */
  public getAngle(): number {
    if (this.direction === 1) {
      return -this.angle
    }
    return this.angle
  }

  public getRect(): CurlRectPoints {
    return this.rect
  }

  public getPosition(): CurlPoint {
    return this.position
  }

  public getActiveCorner(): CurlPoint {
    if (this.direction === 1) {
      return this.rect.topLeft
    }
    return this.rect.topRight
  }

  public getDirection(): CurlDirection {
    return this.direction
  }

  /** 翻页进度 0..1（原版为 0-100，此处归一） */
  public getFlippingProgress(): number {
    return Math.abs((this.position.x - this.pageWidth) / (2 * this.pageWidth))
  }

  public getCorner(): CurlCorner {
    return this.corner
  }

  /** 底层页起始位置（页坐标） */
  public getBottomPagePosition(): CurlPoint {
    if (this.direction === -1) {
      return { x: this.pageWidth, y: 0 }
    }
    return { x: 0, y: 0 }
  }

  /** 阴影起始点（页坐标；退化情形可能为 null） */
  public getShadowStartPoint(): CurlPoint | null {
    if (this.corner === 'top') {
      return this.topIntersectPoint
    }
    if (this.sideIntersectPoint !== null) {
      return this.sideIntersectPoint
    }
    return this.topIntersectPoint
  }

  /** 阴影相对书本的旋转角（rad） */
  public getShadowAngle(): number {
    const angle = getAngleBetweenTwoLine(this.getSegmentToShadowLine(), [
      { x: 0, y: 0 },
      { x: this.pageWidth, y: 0 }
    ])

    if (this.direction === 1) {
      return angle
    }
    return Math.PI - angle
  }

  private calcAngleAndPosition(pos: CurlPoint): CurlPoint {
    let result = pos

    this.updateAngleAndGeometry(result)

    if (this.corner === 'top') {
      result = this.checkPositionAtCenterLine(result, { x: 0, y: 0 }, { x: 0, y: this.pageHeight })
    } else {
      result = this.checkPositionAtCenterLine(result, { x: 0, y: this.pageHeight }, { x: 0, y: 0 })
    }

    if (Math.abs(result.x - this.pageWidth) < 1 && Math.abs(result.y) < 1) {
      throw new Error('Point is too small')
    }

    return result
  }

  private updateAngleAndGeometry(pos: CurlPoint): void {
    this.angle = this.calculateAngle(pos)
    this.rect = this.getPageRect(pos)
  }

  private calculateAngle(pos: CurlPoint): number {
    const left = this.pageWidth - pos.x + 1
    const top = this.corner === 'bottom' ? this.pageHeight - pos.y : pos.y

    let angle = 2 * Math.acos(left / Math.sqrt(top * top + left * left))

    if (top < 0) {
      angle = -angle
    }

    const da = Math.PI - angle
    if (!isFinite(angle) || (da >= 0 && da < 0.003)) {
      throw new Error('The G point is too small')
    }

    if (this.corner === 'bottom') {
      angle = -angle
    }

    return angle
  }

  private getPageRect(localPos: CurlPoint): CurlRectPoints {
    if (this.corner === 'top') {
      return this.getRectFromBasePoint(
        [
          { x: 0, y: 0 },
          { x: this.pageWidth, y: 0 },
          { x: 0, y: this.pageHeight },
          { x: this.pageWidth, y: this.pageHeight }
        ],
        localPos
      )
    }

    return this.getRectFromBasePoint(
      [
        { x: 0, y: -this.pageHeight },
        { x: this.pageWidth, y: -this.pageHeight },
        { x: 0, y: 0 },
        { x: this.pageWidth, y: 0 }
      ],
      localPos
    )
  }

  private getRectFromBasePoint(points: CurlPoint[], localPos: CurlPoint): CurlRectPoints {
    return {
      topLeft: this.getRotatedPoint(points[0], localPos),
      topRight: this.getRotatedPoint(points[1], localPos),
      bottomLeft: this.getRotatedPoint(points[2], localPos),
      bottomRight: this.getRotatedPoint(points[3], localPos)
    }
  }

  private getRotatedPoint(transformedPoint: CurlPoint, startPoint: CurlPoint): CurlPoint {
    return {
      x:
        transformedPoint.x * Math.cos(this.angle) +
        transformedPoint.y * Math.sin(this.angle) +
        startPoint.x,
      y:
        transformedPoint.y * Math.cos(this.angle) -
        transformedPoint.x * Math.sin(this.angle) +
        startPoint.y
    }
  }

  private calculateIntersectPoint(pos: CurlPoint): void {
    const boundRect: CurlRect = {
      left: -1,
      top: -1,
      width: this.pageWidth + 2,
      height: this.pageHeight + 2
    }

    if (this.corner === 'top') {
      this.topIntersectPoint = getIntersectBetweenTwoSegment(
        boundRect,
        [pos, this.rect.topRight],
        [
          { x: 0, y: 0 },
          { x: this.pageWidth, y: 0 }
        ]
      )

      this.sideIntersectPoint = getIntersectBetweenTwoSegment(
        boundRect,
        [pos, this.rect.bottomLeft],
        [
          { x: this.pageWidth, y: 0 },
          { x: this.pageWidth, y: this.pageHeight }
        ]
      )

      this.bottomIntersectPoint = getIntersectBetweenTwoSegment(
        boundRect,
        [this.rect.bottomLeft, this.rect.bottomRight],
        [
          { x: 0, y: this.pageHeight },
          { x: this.pageWidth, y: this.pageHeight }
        ]
      )
    } else {
      this.topIntersectPoint = getIntersectBetweenTwoSegment(
        boundRect,
        [this.rect.topLeft, this.rect.topRight],
        [
          { x: 0, y: 0 },
          { x: this.pageWidth, y: 0 }
        ]
      )

      this.sideIntersectPoint = getIntersectBetweenTwoSegment(
        boundRect,
        [pos, this.rect.topLeft],
        [
          { x: this.pageWidth, y: 0 },
          { x: this.pageWidth, y: this.pageHeight }
        ]
      )

      this.bottomIntersectPoint = getIntersectBetweenTwoSegment(
        boundRect,
        [this.rect.bottomLeft, this.rect.bottomRight],
        [
          { x: 0, y: this.pageHeight },
          { x: this.pageWidth, y: this.pageHeight }
        ]
      )
    }
  }

  private checkPositionAtCenterLine(
    checkedPos: CurlPoint,
    centerOne: CurlPoint,
    centerTwo: CurlPoint
  ): CurlPoint {
    let result = checkedPos

    const tmp = limitPointToCircle(centerOne, this.pageWidth, result)
    if (result !== tmp) {
      result = tmp
      this.updateAngleAndGeometry(result)
    }

    const rad = Math.sqrt(Math.pow(this.pageWidth, 2) + Math.pow(this.pageHeight, 2))

    let checkPointOne = this.rect.bottomRight
    let checkPointTwo = this.rect.topLeft

    if (this.corner === 'bottom') {
      checkPointOne = this.rect.topRight
      checkPointTwo = this.rect.bottomLeft
    }

    if (checkPointOne.x <= 0) {
      const bottomPoint = limitPointToCircle(centerTwo, rad, checkPointTwo)

      if (bottomPoint !== result) {
        result = bottomPoint
        this.updateAngleAndGeometry(result)
      }
    }

    return result
  }

  private getSegmentToShadowLine(): [CurlPoint, CurlPoint] {
    const first = this.getShadowStartPoint()

    const second =
      first !== this.sideIntersectPoint && this.sideIntersectPoint !== null
        ? this.sideIntersectPoint
        : this.bottomIntersectPoint

    return [first as CurlPoint, second as CurlPoint]
  }
}
