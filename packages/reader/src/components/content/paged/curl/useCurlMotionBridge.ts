/**
 * 仿真翻页运动桥接（phase-14）— 对标 useCoverMotionBridge：
 * 翻页页/底层页 clip-path+transform 与双阴影的命令式独占写入。
 *
 * 数据流：
 * - vanilla subscribe reading-store（dragOffset + dragPoint 二维触点），rAF 合帧后
 *   经 core/curl 几何核算 CurlFrame，直写 4 组 style（翻页页 clip+transform /
 *   底层页 clip / outerShadow / innerShadow），拖拽期间 PagedReader 零 re-render；
 * - 拖拽会话（方向/角部/相邻页）变化才回调 onDragSessionChange（低频结构渲染）；
 * - 提交/回弹 = 折角点弹簧（路径参数 t 单弹簧，起点→终点直线插值，
 *   与 (x,y) 双弹簧同构但天然同步落定）：松手速度经 projectVelocityToPath
 *   投影为 t 初速度，速度连续、可打断；
 * - flipAnimating 期间仅响应「新拖拽打断」：cancel + 清样式 + 移交
 *   onSpringSettleInterrupted 走 finalizeAnim 状态收尾；
 * - 落幕/空闲同步归位：清除双页 clip-path/transform、隐藏阴影，
 *   防止规范流本体残留裁剪（划线/批注依赖 DOM 完整可见）。
 *
 * 坐标约定：store.dragPoint 为 viewport 相对坐标；几何核页坐标系见 core/curl/types.ts
 * （next 恒等，prev x 镜像；屏幕可见区 next=[0,W]，prev=[-W,0]）。
 * 页宽 = pageStride（页容器撑满 viewport），页高 = 页容器 clientHeight。
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
  buildFlippingBackFaceStyle,
  buildFlippingPageStyle,
  buildInnerShadowStyle,
  buildOuterShadowStyle,
  type CurlShadowStyle
} from '../../../../core/curl/render-style'
import { createSpringAnimation, type SpringAnimation } from '../../../../core/motion'
import {
  resolveAdjacentPageSurface,
  resolvePageSurface,
  type PageSurface
} from '../../../../core/pages'
import { createRafBatcher } from '../../../../hooks/raf-batcher'
import { useReadingStore } from '../../../../store/reading-store'

/** 弹簧路径参数 t 的初速度上限（t/ms）：极端甩动全路径 ≥50ms，动画可读 */
const MAX_SPRING_T_VELOCITY = 0.02

/** 拖拽会话：方向 + 角部 + 相邻页单元；null 表示空闲（无拖拽无动画） */
export interface CurlDragSession {
  direction: CurlDirection
  /** 折角所在书角（按下点 y 决定，整次拖拽固定） */
  corner: CurlCorner
  adjacent: PageSurface | null
}

export interface UseCurlMotionBridgeInput {
  /** false 时（cover 模式）不订阅 store，双桥互不抢写 */
  enabled: boolean
  /** 当前页容器根 ref（规范流本体所在 PageSurfaceView；仿真模式保持平铺不参与变换） */
  currentRootRef: RefObject<HTMLDivElement | null>
  /** 主克隆页容器根 ref（next=下一页底层显露区 / 提交落幕遮盖；未挂载时为 null） */
  cloneRootRef: RefObject<HTMLDivElement | null>
  /** flap 克隆页容器根 ref（翻页页：next=当前页折角副本 / prev=上一页铺入） */
  flapCloneRootRef: RefObject<HTMLDivElement | null>
  /** 底层页外阴影元素 ref（投在底层页上） */
  outerShadowRef: RefObject<HTMLDivElement | null>
  /** 翻页页内阴影元素 ref（折痕背光侧） */
  innerShadowRef: RefObject<HTMLDivElement | null>
  /** 拖拽会话变化（开始/换向/相邻页变化/结束）——低频，驱动结构渲染 */
  onDragSessionChange: (session: CurlDragSession | null) => void
  /** 弹簧被新拖拽打断：PagedReader 执行 finalizeAnim 状态收尾（提交即完成/回弹即归位） */
  onSpringSettleInterrupted: () => void
}

export interface CurlPlaySpringInput {
  direction: CurlDirection
  corner: CurlCorner
  /** 动画起点折角点（页坐标）：拖拽松手=当前跟手点；点击=页角内侧起点 */
  from: CurlPoint
  /** 动画终点折角点（页坐标）：提交=对侧 commit 点；回弹=静止位 rest 点 */
  to: CurlPoint
  /** 松手速度 viewport x 分量（px/ms；内部投影为 t 初速度并 clamp） */
  velocity?: number
  /** 是否有相邻页（首末页阻尼回弹为 false：翻页页=当前页、无底层页） */
  hasAdjacent?: boolean
  onComplete: () => void
}

export interface CurlMotionBridge {
  playSpring: (input: CurlPlaySpringInput) => void
  /** 取消进行中的弹簧（无动画落定由调用方/后续帧负责） */
  cancelSpring: () => void
  /** 当前已渲染的折角点（页坐标）：提交/回弹动画起点捕获用；空闲为 null */
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
  /** 上次已通知的会话 key（direction:corner:adjacentKey），避免重复回调 */
  const sessionKeyRef = useRef<string | null>(null)
  /** flap 未挂载时的补帧重试计数（会话首帧克隆未挂载的闪帧规避） */
  const retryRef = useRef(0)
  /** 本次拖拽的折角书角（按下点决定，跨换向保持） */
  const cornerRef = useRef<CurlCorner | null>(null)
  /** 最近一次成功渲染的折角点（页坐标） */
  const lastPointRef = useRef<CurlPoint | null>(null)
  /** 几何核缓存（参数变化才重建） */
  const calcRef = useRef<{
    direction: CurlDirection
    corner: CurlCorner
    w: number
    h: number
    calc: CurlCalculation
  } | null>(null)

  const getCalc = (direction: CurlDirection, corner: CurlCorner, w: number, h: number): CurlCalculation => {
    const cached = calcRef.current
    if (cached && cached.direction === direction && cached.corner === corner && cached.w === w && cached.h === h) {
      return cached.calc
    }
    const calc = new CurlCalculation(direction, corner, w, h)
    calcRef.current = { direction, corner, w, h, calc }
    return calc
  }

  /** 读当前页几何：宽 = pageStride（页容器撑满 viewport），高 = 页容器 clientHeight */
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
      return
    }
    el.style.display = 'block'
    el.style.width = `${style.width}px`
    el.style.height = `${style.height}px`
    el.style.transform = style.transform
    el.style.transformOrigin = style.transformOrigin
    el.style.background = style.background
    el.style.clipPath = style.clipPath
  }

  /** 落幕/空闲归位：清除各页 clip/transform + 隐藏阴影（规范流本体零残留） */
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
  }

  /**
   * 单帧渲染：折角点（页坐标）→ style 直写。
   *
   * 三元素模型（与 page-flip portrait 同构）：
   * - 规范流本体（当前页）始终平铺不动（prev 时它就是被盖住的底层页）；
   * - 翻页页 = flap 克隆（next=当前页折角副本，prev=上一页铺入）：next 整元素折痕
   *   反射呈纸张背面（反向文字 + 纸色罩），prev 正面 transform+clip 铺入；
   * - 底层显露页 = 主克隆（仅 next + 有相邻页）：clip 到 bottomClip 露出区。
   *
   * @returns 翻页页元素是否已挂载并完成写入（false 时调用方应补帧重试）
   */
  const renderFrame = (direction: CurlDirection, frame: CurlFrame, w: number, h: number, hasAdjacent: boolean): boolean => {
    const flippingEl = flapCloneRootRef.current
    const bottomEl = direction === 1 && hasAdjacent ? cloneRootRef.current : null

    if (flippingEl) {
      // next（当前页向右翻出）：整元素折痕反射 → 纸张背面（倾斜+反向文字 + 纸色罩）；
      // prev（上一页正面朝上铺入）：正面渲染，不镜像不罩（退化帧保持上一帧）
      const mirrored = direction === 1
      const style = mirrored
        ? buildFlippingBackFaceStyle(frame, direction)
        : buildFlippingPageStyle(frame, direction)
      if (style) {
        flippingEl.style.transform = style.transform
        flippingEl.style.clipPath = style.clipPath
      }
      flippingEl.style.setProperty('--curl-tint', mirrored ? '0.55' : '0')
    }
    if (bottomEl) {
      const clip = buildBottomPageClipPath(frame, direction)
      if (clip) bottomEl.style.clipPath = clip
      else bottomEl.style.removeProperty('clip-path')
    }
    writeShadow(outerShadowRef.current, buildOuterShadowStyle(frame, direction, w, h))
    writeShadow(innerShadowRef.current, buildInnerShadowStyle(frame, direction, w, h))
    return flippingEl !== null
  }

  /** 折角点 → 几何帧 → 渲染；退化帧跳过（保持上一帧，与 page-flip 一致） */
  const renderPoint = (direction: CurlDirection, corner: CurlCorner, w: number, h: number, point: CurlPoint, hasAdjacent: boolean): boolean => {
    const frame = calcCurlFrame(getCalc(direction, corner, w, h), point)
    if (!frame) return true
    lastPointRef.current = point
    return renderFrame(direction, frame, w, h, hasAdjacent)
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

      // 弹簧飞行期间：仅响应「新拖拽打断」，其余写入归弹簧
      if (s.flipAnimating) {
        if (s.dragOffset !== 0 && springRef.current) {
          cancelSpring()
          clearAll()
          sessionKeyRef.current = null
          cornerRef.current = null
          lastPointRef.current = null
          callbacksRef.current.onSpringSettleInterrupted()
        }
        return
      }

      // 拖拽跟手：触点即折角点（二维），会话变化才回调（低频结构渲染）
      if (s.dragOffset !== 0 && s.dragPoint) {
        const current = resolvePageSurface(s.globalPageIndex, s.buffer)
        const size = getPageSize()
        if (!current || !size) return
        const { w, h } = size
        const direction: CurlDirection = s.dragOffset < 0 ? 1 : -1
        const adjacent = resolveAdjacentPageSurface(current, direction, s.buffer)
        if (sessionKeyRef.current === null || cornerRef.current === null) {
          cornerRef.current = resolveCurlCorner(s.dragPoint.y, h)
        }
        const corner = cornerRef.current
        const key = `${direction}:${corner}:${adjacent?.key ?? 'none'}`
        if (sessionKeyRef.current !== key) {
          sessionKeyRef.current = key
          callbacksRef.current.onDragSessionChange({ direction, corner, adjacent })
        }
        const point = adjacent
          ? toCurlPagePoint(clampCurlDragPoint(s.dragPoint, direction, w), direction)
          : getDampedCurlPoint(direction, corner, s.dragOffset, s.dragPoint.y, w, h)
        const written = renderPoint(direction, corner, w, h, point, adjacent !== null)
        if (!written) {
          // flap 克隆未挂载（会话首帧）：补帧重试直至挂载，避免平铺态闪帧
          if (retryRef.current < 30) {
            retryRef.current += 1
            batcher.schedule(applyFrame)
          }
        } else {
          retryRef.current = 0
        }
        return
      }

      // 空闲：会话收尾 + 双页归位 + 阴影隐藏（静止态零 clip 残留）
      if (sessionKeyRef.current !== null) {
        sessionKeyRef.current = null
        cornerRef.current = null
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

    // mount 立即归位一次（覆盖 boot 定位）
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
    playSpring: ({ direction, corner, from, to, velocity = 0, hasAdjacent = true, onComplete }) => {
      cancelSpring()
      const size = getPageSize()
      if (!size) {
        onComplete()
        return
      }
      const { w, h } = size
      // 首帧同步渲染起点（from 无跳变起步）
      renderPoint(direction, corner, w, h, from, hasAdjacent)
      const rawV = projectVelocityToPath(velocity, direction, from, to)
      const v = Math.max(-MAX_SPRING_T_VELOCITY, Math.min(MAX_SPRING_T_VELOCITY, rawV))

      springRef.current = createSpringAnimation({
        from: 0,
        to: 1,
        velocity: v,
        onUpdate: (t) => {
          renderPoint(direction, corner, w, h, lerpCurlPoint(from, to, t), hasAdjacent)
        },
        onComplete: () => {
          springRef.current = null
          onComplete()
          // 落幕同步归位：onComplete（finalizeAnim）已同步完成结构重排
          // （提交转正/回弹卸载克隆），空闲态立即清除全部 clip/transform/阴影
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
