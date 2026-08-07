/**
 * 仿真翻页运动桥接（phase-14）— 对标 useCoverMotionBridge。
 *
 * 起滑位置决定折痕形态（两套几何，同一套左右对称图层）：
 * - 中部带（|y-h/2| < 0.25h）：直线折痕 straight-fold，竖直卷边；
 * - 上下角：对角折角 CurlCalculation，倾斜由 top/bottom 决定。
 *
 * 左右滑均在 viewport/next 同构坐标下计算：
 * - next：flap=当前背面，主克隆=下一页显露区；
 * - prev：flap=上一页背面，主克隆=上一页已放平区（向右放平）。
 */
import { useEffect, useRef, type RefObject } from 'react'
import {
  calcCurlFrame,
  clampCurlDragPoint,
  CurlCalculation,
  getDampedCurlPoint,
  lerpCurlPoint,
  projectVelocityToPath,
  resolveCurlCorner,
  toCurlPagePoint,
  type CurlCorner,
  type CurlDirection,
  type CurlFrame,
  type CurlPoint
} from '../../../../core/curl'
import {
  buildBottomPageClipPath,
  buildCreaseShadowStyle,
  buildFlippingBackFaceStyle,
  buildInnerShadowStyle,
  buildLandedPageClipPath,
  buildOuterShadowStyle,
  type CurlShadowStyle
} from '../../../../core/curl/render-style'
import {
  buildStraightBottomClip,
  buildStraightFlapStyle,
  buildStraightShadowStyle,
  computeStraightFold,
  type StraightShadowStyle
} from '../../../../core/curl/straight-fold'
import { createSpringAnimation, type SpringAnimation } from '../../../../core/motion'
import {
  resolveAdjacentPageSurface,
  resolvePageSurface,
  type PageSurface
} from '../../../../core/pages'
import { createRafBatcher } from '../../../../hooks/raf-batcher'
import { useReadingStore } from '../../../../store/reading-store'

const MAX_SPRING_T_VELOCITY = 0.006
const MAX_SPRING_PX_VELOCITY = 3

const CURL_FLIP_SPRING = { stiffness: 32, damping: 10, mass: 1 }
const CURL_SPRING_SETTLE = { position: 0.002, velocity: 0.00005 }
const CURL_SPRING_MAX_DURATION_MS = 2500

/** 对角几何恒用 next（viewport 同构）；flipDirection 仅决定图层 */
const GEOM_DIRECTION: CurlDirection = 1

/** 中部带：相对页高中线 ±25% 用竖直折痕 */
const MID_BAND_RATIO = 0.25

export interface CurlDragSession {
  direction: CurlDirection
  corner: CurlCorner
  /** corner=对角折角；straight=中部竖直折痕 */
  kind: 'corner' | 'straight'
  adjacent: PageSurface | null
}

export interface UseCurlMotionBridgeInput {
  enabled: boolean
  currentRootRef: RefObject<HTMLDivElement | null>
  cloneRootRef: RefObject<HTMLDivElement | null>
  flapCloneRootRef: RefObject<HTMLDivElement | null>
  outerShadowRef: RefObject<HTMLDivElement | null>
  innerShadowRef: RefObject<HTMLDivElement | null>
  creaseShadowRef: RefObject<HTMLDivElement | null>
  onDragSessionChange: (session: CurlDragSession | null) => void
  onSpringSettleInterrupted: () => void
}

export interface CurlPlaySpringInput {
  direction: CurlDirection
  corner: CurlCorner
  kind?: 'corner' | 'straight'
  from?: CurlPoint
  to?: CurlPoint
  fromX?: number
  toX?: number
  velocity?: number
  hasAdjacent?: boolean
  onComplete: () => void
}

export interface CurlMotionBridge {
  playSpring: (input: CurlPlaySpringInput) => void
  cancelSpring: () => void
  getCurrentPoint: () => CurlPoint | null
}

export function useCurlMotionBridge(input: UseCurlMotionBridgeInput): CurlMotionBridge {
  const {
    enabled,
    currentRootRef,
    cloneRootRef,
    flapCloneRootRef,
    outerShadowRef,
    innerShadowRef,
    creaseShadowRef,
    onDragSessionChange,
    onSpringSettleInterrupted
  } = input
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const callbacksRef = useRef({ onDragSessionChange, onSpringSettleInterrupted })
  callbacksRef.current = { onDragSessionChange, onSpringSettleInterrupted }

  const batcherRef = useRef<ReturnType<typeof createRafBatcher> | null>(null)
  if (!batcherRef.current) batcherRef.current = createRafBatcher()

  const springRef = useRef<SpringAnimation | null>(null)
  const sessionKeyRef = useRef<string | null>(null)
  const retryRef = useRef(0)
  const cornerRef = useRef<CurlCorner | null>(null)
  const kindRef = useRef<'corner' | 'straight'>('corner')
  const lastPointRef = useRef<CurlPoint | null>(null)
  const calcRef = useRef<{
    corner: CurlCorner
    w: number
    h: number
    calc: CurlCalculation
  } | null>(null)

  const getCalc = (corner: CurlCorner, w: number, h: number): CurlCalculation => {
    const cached = calcRef.current
    if (cached && cached.corner === corner && cached.w === w && cached.h === h) {
      return cached.calc
    }
    const calc = new CurlCalculation(GEOM_DIRECTION, corner, w, h)
    calcRef.current = { corner, w, h, calc }
    return calc
  }

  const getPageSize = (): { w: number; h: number } | null => {
    const s = useReadingStore.getState()
    const h = currentRootRef.current?.clientHeight ?? 0
    if (s.pageStride <= 0 || h <= 0) return null
    return { w: s.pageStride, h }
  }

  const writeShadow = (el: HTMLDivElement | null, style: CurlShadowStyle | null): void => {
    if (!el) return
    if (!style || style.width <= 0) {
      el.style.display = 'none'
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.background = ''
      el.style.clipPath = ''
      return
    }
    el.style.display = 'block'
    el.style.left = '0'
    el.style.top = '0'
    el.style.width = `${style.width}px`
    el.style.height = `${style.height}px`
    el.style.transform = style.transform
    el.style.transformOrigin = style.transformOrigin
    el.style.background = style.background
    el.style.clipPath = style.clipPath
  }

  /** 直线折痕阴影：只用 transform 定位，不写 left/top，避免污染对角模式 */
  const writeStraightShadow = (
    el: HTMLDivElement | null,
    style: StraightShadowStyle | null
  ): void => {
    if (!el) return
    if (!style || style.width <= 0) {
      el.style.display = 'none'
      el.style.transform = ''
      el.style.transformOrigin = ''
      el.style.background = ''
      el.style.clipPath = ''
      return
    }
    el.style.display = 'block'
    el.style.transform = `translate3d(${style.left.toFixed(2)}px, 0px, 0)`
    el.style.transformOrigin = '0 0'
    el.style.width = `${style.width.toFixed(2)}px`
    el.style.height = `${style.height.toFixed(2)}px`
    el.style.background = style.background
    el.style.clipPath = 'none'
  }

  const clearAll = (): void => {
    const cur = currentRootRef.current
    const cln = cloneRootRef.current
    const flap = flapCloneRootRef.current
    if (cur) {
      cur.style.removeProperty('transform')
      cur.style.removeProperty('clip-path')
    }
    if (cln) {
      cln.style.removeProperty('transform')
      cln.style.removeProperty('clip-path')
    }
    if (flap) {
      flap.style.removeProperty('transform')
      flap.style.removeProperty('clip-path')
      flap.style.removeProperty('--curl-tint')
    }
    writeShadow(outerShadowRef.current, null)
    writeShadow(innerShadowRef.current, null)
    writeShadow(creaseShadowRef.current, null)
  }

  const renderStraightFrame = (
    fingerX: number,
    flipDirection: CurlDirection,
    w: number,
    h: number,
    hasAdjacent: boolean
  ): boolean => {
    const sf = computeStraightFold(fingerX, flipDirection, w, h)
    if (!sf) return true
    lastPointRef.current = { x: fingerX, y: h / 2 }
    const flippingEl = flapCloneRootRef.current
    const bottomEl = hasAdjacent ? cloneRootRef.current : null
    if (flippingEl) {
      const st = buildStraightFlapStyle(sf)
      flippingEl.style.transform = st.transform
      flippingEl.style.clipPath = st.clipPath
      flippingEl.style.setProperty('--curl-tint', '0.55')
    }
    if (bottomEl) {
      const clip = buildStraightBottomClip(sf)
      if (clip) bottomEl.style.clipPath = clip
      else bottomEl.style.removeProperty('clip-path')
    }
    writeStraightShadow(outerShadowRef.current, buildStraightShadowStyle(sf, 'outer'))
    writeStraightShadow(creaseShadowRef.current, buildStraightShadowStyle(sf, 'crease'))
    writeStraightShadow(innerShadowRef.current, buildStraightShadowStyle(sf, 'inner'))
    return flippingEl !== null && (!hasAdjacent || bottomEl !== null)
  }

  const renderFrame = (
    flipDirection: CurlDirection,
    frame: CurlFrame,
    w: number,
    h: number,
    hasAdjacent: boolean
  ): boolean => {
    const flippingEl = flapCloneRootRef.current
    const bottomEl = hasAdjacent ? cloneRootRef.current : null

    if (flippingEl) {
      const style = buildFlippingBackFaceStyle(frame, GEOM_DIRECTION)
      if (style) {
        flippingEl.style.transform = style.transform
        flippingEl.style.clipPath = style.clipPath
      }
      flippingEl.style.setProperty('--curl-tint', '0.55')
    }
    if (bottomEl) {
      const clip =
        flipDirection === 1
          ? buildBottomPageClipPath(frame)
          : buildLandedPageClipPath(frame, w, h)
      if (clip) bottomEl.style.clipPath = clip
      else bottomEl.style.removeProperty('clip-path')
    }
    writeShadow(outerShadowRef.current, buildOuterShadowStyle(frame, GEOM_DIRECTION, w, h))
    writeShadow(innerShadowRef.current, buildInnerShadowStyle(frame, GEOM_DIRECTION, w, h))
    writeShadow(creaseShadowRef.current, buildCreaseShadowStyle(frame, GEOM_DIRECTION, w, h))
    return flippingEl !== null && (!hasAdjacent || bottomEl !== null)
  }

  const renderPoint = (
    flipDirection: CurlDirection,
    corner: CurlCorner,
    w: number,
    h: number,
    point: CurlPoint,
    hasAdjacent: boolean
  ): boolean => {
    const frame = calcCurlFrame(getCalc(corner, w, h), point)
    if (!frame) return true
    lastPointRef.current = point
    return renderFrame(flipDirection, frame, w, h, hasAdjacent)
  }

  const cancelSpring = (): void => {
    springRef.current?.cancel()
    springRef.current = null
  }

  useEffect(() => {
    if (!enabled) return undefined
    const batcher = batcherRef.current!

    const applyFrame = (): void => {
      const s = useReadingStore.getState()

      if (s.flipAnimating) {
        if (s.dragOffset !== 0 && springRef.current) {
          cancelSpring()
          clearAll()
          sessionKeyRef.current = null
          cornerRef.current = null
          kindRef.current = 'corner'
          lastPointRef.current = null
          callbacksRef.current.onSpringSettleInterrupted()
        }
        return
      }

      if (s.dragOffset !== 0 && s.dragPoint) {
        const current = resolvePageSurface(s.globalPageIndex, s.buffer)
        const size = getPageSize()
        if (!current || !size) return
        const { w, h } = size
        const flipDirection: CurlDirection = s.dragOffset < 0 ? 1 : -1
        const adjacent = resolveAdjacentPageSurface(current, flipDirection, s.buffer)
        // 会话首帧：中部=竖直折痕，上下角=对角折角（整次拖拽固定）
        if (sessionKeyRef.current === null || cornerRef.current === null) {
          const midBand = Math.abs(s.dragPoint.y - h / 2) < h * MID_BAND_RATIO
          kindRef.current = midBand ? 'straight' : 'corner'
          cornerRef.current = resolveCurlCorner(s.dragPoint.y, h)
        }
        const corner = cornerRef.current
        const kind = kindRef.current
        const key = `${flipDirection}:${corner}:${kind}:${adjacent?.key ?? 'none'}`
        if (sessionKeyRef.current !== key) {
          sessionKeyRef.current = key
          callbacksRef.current.onDragSessionChange({
            direction: flipDirection,
            corner,
            kind,
            adjacent
          })
        }

        const written =
          kind === 'straight'
            ? renderStraightFrame(s.dragPoint.x, flipDirection, w, h, adjacent !== null)
            : renderPoint(
                flipDirection,
                corner,
                w,
                h,
                adjacent
                  ? toCurlPagePoint(
                      clampCurlDragPoint(s.dragPoint, flipDirection, w),
                      flipDirection
                    )
                  : getDampedCurlPoint(
                      flipDirection,
                      corner,
                      s.dragOffset,
                      s.dragPoint.y,
                      w,
                      h
                    ),
                adjacent !== null
              )

        if (!written) {
          if (retryRef.current < 30) {
            retryRef.current += 1
            batcher.schedule(applyFrame)
          }
        } else {
          retryRef.current = 0
        }
        return
      }

      if (sessionKeyRef.current !== null) {
        sessionKeyRef.current = null
        cornerRef.current = null
        kindRef.current = 'corner'
        retryRef.current = 0
        callbacksRef.current.onDragSessionChange(null)
      }
      lastPointRef.current = null
      clearAll()
    }

    const schedule = (): void => batcher.schedule(applyFrame)

    const unsub = useReadingStore.subscribe((state, prev) => {
      if (
        state.dragOffset !== prev.dragOffset ||
        state.dragPoint !== prev.dragPoint ||
        state.globalPageIndex !== prev.globalPageIndex ||
        state.pageStride !== prev.pageStride ||
        state.flipAnimating !== prev.flipAnimating ||
        state.buffer !== prev.buffer
      ) {
        schedule()
      }
    })

    schedule()

    return () => {
      unsub()
      batcher.cancel()
      cancelSpring()
      clearAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return {
    playSpring: ({
      direction: flipDirection,
      corner,
      kind = 'corner',
      from,
      to,
      fromX,
      toX,
      velocity = 0,
      hasAdjacent = true,
      onComplete
    }) => {
      cancelSpring()
      const size = getPageSize()
      if (!size) {
        onComplete()
        return
      }
      const { w, h } = size

      if (kind === 'straight') {
        const startX = fromX ?? (flipDirection === 1 ? w : -w)
        const endX = toX ?? (flipDirection === 1 ? -w : w)
        renderStraightFrame(startX, flipDirection, w, h, hasAdjacent)
        const v = Math.max(
          -MAX_SPRING_PX_VELOCITY,
          Math.min(MAX_SPRING_PX_VELOCITY, velocity)
        )
        springRef.current = createSpringAnimation({
          from: startX,
          to: endX,
          velocity: v,
          config: CURL_FLIP_SPRING,
          maxDurationMs: CURL_SPRING_MAX_DURATION_MS,
          onUpdate: (x) => {
            renderStraightFrame(x, flipDirection, w, h, hasAdjacent)
          },
          onComplete: () => {
            springRef.current = null
            onComplete()
            const s = useReadingStore.getState()
            if (!s.flipAnimating && s.dragOffset === 0) {
              lastPointRef.current = null
              clearAll()
            }
          }
        })
        return
      }

      const start = from!
      const end = to!
      renderPoint(flipDirection, corner, w, h, start, hasAdjacent)
      const rawV = projectVelocityToPath(velocity, flipDirection, start, end)
      const v = Math.max(-MAX_SPRING_T_VELOCITY, Math.min(MAX_SPRING_T_VELOCITY, rawV))

      springRef.current = createSpringAnimation({
        from: 0,
        to: 1,
        velocity: v,
        config: CURL_FLIP_SPRING,
        settleTolerance: CURL_SPRING_SETTLE,
        maxDurationMs: CURL_SPRING_MAX_DURATION_MS,
        onUpdate: (t) => {
          renderPoint(flipDirection, corner, w, h, lerpCurlPoint(start, end, t), hasAdjacent)
        },
        onComplete: () => {
          springRef.current = null
          onComplete()
          const s = useReadingStore.getState()
          if (!s.flipAnimating && s.dragOffset === 0) {
            lastPointRef.current = null
            clearAll()
          }
        }
      })
    },
    cancelSpring,
    getCurrentPoint: () => lastPointRef.current
  }
}
