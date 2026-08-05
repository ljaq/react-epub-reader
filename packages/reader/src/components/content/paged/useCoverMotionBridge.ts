/**
 * 覆盖模式运动桥接（phase-11）— 当前页/克隆页 transform 的命令式独占写入。
 *
 * 替代原「dragOffset → setState → PagedReader 每帧 re-render → JSX style」热路径：
 * - vanilla subscribe reading-store（不经 React），rAF 合帧后直写页容器
 *   transform；拖拽跟手期间 PagedReader 零 re-render；
 * - 拖拽会话（方向/相邻页）变化才回调 onDragSessionChange（低频），由
 *   PagedReader 负责克隆挂载、z 序、阴影 class 等结构渲染；
 * - 补间动画为弹簧驱动（playSpring）：速度连续、可打断；打断路径 cancel +
 *   归位 + onSpringSettleInterrupted 移交 PagedReader 走 finalizeAnim 状态收尾；
 * - flipAnimating（弹簧飞行）期间不响应普通 dragOffset 写入，避免与弹簧打架；
 *   检测到新拖拽（dragOffset 非零）则打断落定；
 * - 弹簧落幕同步归位：onComplete 内 PagedReader 已同步完成结构重排（提交转正），
 *   桥接立即把双页写回静止位，避免新规范流继承弹簧末位一帧；
 * - 单写者原则：两个页容器的 transform 由本桥接独占，JSX 不再设置。
 *
 * phase-13 视差翻页：
 * - 底层静态页以 1/4 速度跟随顶层移动页做视差位移；
 * - 底层静态页挂载黑色半透明遮罩（CSS 变量 --cover-overlay），滑动过程中渐隐。
 */
import { useEffect, useRef, type RefObject } from 'react'
import {
  getCoverMovingTranslateX,
  getCoverStaticParallaxX,
  getCoverOverlayOpacity,
  type CoverDirection
} from '../../../core/flip'
import { createSpringAnimation, type SpringAnimation } from '../../../core/motion'
import {
  resolveAdjacentPageSurface,
  resolvePageSurface,
  type PageSurface
} from '../../../core/pages'
import { createRafBatcher } from '../../../hooks/raf-batcher'
import { useReadingStore } from '../../../store/reading-store'

/** 弹簧初速度上限（px/ms ≈ 6000px/s）：极端甩动不至于动画不可读 */
const MAX_SPRING_VELOCITY = 6

/** 拖拽会话：方向 + 相邻页单元；null 表示空闲（无拖拽无动画） */
export interface CoverDragSession {
  direction: CoverDirection
  adjacent: PageSurface | null
}

export interface UseCoverMotionBridgeInput {
  /** 当前页容器根 ref（规范流本体所在 PageSurfaceView） */
  currentRootRef: RefObject<HTMLDivElement | null>
  /** 克隆页容器根 ref（相邻页克隆 PageSurfaceView，未挂载时为 null） */
  cloneRootRef: RefObject<HTMLDivElement | null>
  /** 拖拽会话变化（开始/换向/相邻页变化/结束）——低频，驱动结构渲染 */
  onDragSessionChange: (session: CoverDragSession | null) => void
  /** 弹簧被新拖拽打断：PagedReader 执行 finalizeAnim 状态收尾（提交即完成/回弹即归位） */
  onSpringSettleInterrupted: () => void
}

export interface PlaySpringInput {
  /** 动画作用的页：当前页 or 克隆页 */
  which: 'current' | 'clone'
  fromX: number
  targetX: number
  /** 初速度 px/ms（内部 clamp 到 ±MAX_SPRING_VELOCITY） */
  velocity?: number
  onComplete: () => void
  /** phase-13 视差翻页方向，用于计算底层静态页位移 + 遮罩渐隐 */
  direction?: CoverDirection
}

export interface CoverMotionBridge {
  playSpring: (input: PlaySpringInput) => void
  /** 取消进行中的弹簧（无动画落定由调用方/后续 applyFrame 负责） */
  cancelSpring: () => void
}

export function useCoverMotionBridge(input: UseCoverMotionBridgeInput): CoverMotionBridge {
  const { currentRootRef, cloneRootRef, onDragSessionChange, onSpringSettleInterrupted } = input
  const callbacksRef = useRef({ onDragSessionChange, onSpringSettleInterrupted })
  callbacksRef.current = { onDragSessionChange, onSpringSettleInterrupted }

  const batcherRef = useRef<ReturnType<typeof createRafBatcher> | null>(null)
  if (!batcherRef.current) batcherRef.current = createRafBatcher()

  const springRef = useRef<SpringAnimation | null>(null)
  /** 上次已通知的会话 key（direction:adjacentKey），避免重复回调 */
  const sessionKeyRef = useRef<string | null>(null)
  /** 各页容器最后写入的位移，避免重复 style 写入 */
  const lastXRef = useRef<{ current: number | null; clone: number | null }>({
    current: null,
    clone: null
  })

  /** 命令式写入指定页容器位移（幂等：同值跳过）。
   *  注意：el 不存在时清掉 lastXRef，避免 clone 挂载后被幂等优化跳过首次写入。 */
  const writeTo = (which: 'current' | 'clone', x: number): void => {
    const el = which === 'current' ? currentRootRef.current : cloneRootRef.current
    if (!el) {
      lastXRef.current[which] = null
      return
    }
    if (lastXRef.current[which] === x) return
    lastXRef.current[which] = x
    el.style.transform = `translateX(${x}px)`
  }

  /** phase-13：写入静态页黑色半透明遮罩透明度（CSS 变量 --cover-overlay） */
  const writeOverlay = (which: 'current' | 'clone', opacity: number): void => {
    const el = which === 'current' ? currentRootRef.current : cloneRootRef.current
    if (!el) return
    el.style.setProperty('--cover-overlay', String(opacity))
  }

  /** phase-13：清除双页遮罩 */
  const clearOverlays = (): void => {
    const cur = currentRootRef.current
    const cln = cloneRootRef.current
    if (cur) cur.style.removeProperty('--cover-overlay')
    if (cln) cln.style.removeProperty('--cover-overlay')
  }

  const cancelSpring = (): void => {
    springRef.current?.cancel()
    springRef.current = null
  }

  useEffect(() => {
    const batcher = batcherRef.current!

    const applyFrame = (): void => {
      const s = useReadingStore.getState()

      // 弹簧飞行（flipAnimating）期间：仅响应「新拖拽打断」，其余写入归弹簧
      if (s.flipAnimating) {
        if (s.dragOffset !== 0 && springRef.current) {
          cancelSpring()
          // 无过渡落定：当前页立即归静止位（对齐旧 finalize 后 render 的 0 位移），
          // 避免提交转正后的新规范流继承弹簧末位一帧
          writeTo('current', 0)
          // 注意：此处不调 clearOverlays()——下一帧拖拽路径会立即写回遮罩值，
          // 先清再写会导致遮罩 0→≈1 的闪黑，保留弹簧末态的遮罩值平滑过渡。
          // 会话状态已被 finalizeAnim 清空，重置 key 使后续跟手重新通知
          sessionKeyRef.current = null
          callbacksRef.current.onSpringSettleInterrupted()
        }
        return
      }

      // 拖拽跟手：每帧直写移动页位移 + 静态页视差 + 遮罩；会话变化才回调（低频结构渲染）
      if (s.dragOffset !== 0) {
        const current = resolvePageSurface(s.globalPageIndex, s.buffer)
        if (!current || s.pageWidth <= 0) return
        const direction: CoverDirection = s.dragOffset < 0 ? 1 : -1
        const adjacent = resolveAdjacentPageSurface(current, direction, s.buffer)
        const key = `${direction}:${adjacent?.key ?? 'none'}`
        if (sessionKeyRef.current !== key) {
          sessionKeyRef.current = key
          callbacksRef.current.onDragSessionChange({ direction, adjacent })
        }
        const movingX = getCoverMovingTranslateX({
          direction,
          dragOffset: s.dragOffset,
          pageWidth: s.pageWidth,
          hasAdjacent: adjacent !== null,
          dragStartX: s.dragStartX
        })
        const currentIsMoving = direction === 1 || adjacent === null
        const movingWhich: 'current' | 'clone' = currentIsMoving ? 'current' : 'clone'
        const staticWhich: 'current' | 'clone' = currentIsMoving ? 'clone' : 'current'

        writeTo(movingWhich, movingX)

        // phase-13 视差翻页：静态页 1/4 速度位移 + 黑色半透明遮罩渐隐
        if (adjacent !== null) {
          const pw = s.pageWidth
          const staticX = getCoverStaticParallaxX(movingX, pw)
          const overlay = getCoverOverlayOpacity(movingX, pw, direction)
          writeTo(staticWhich, staticX)
          writeOverlay(staticWhich, overlay)
        } else {
          writeTo(staticWhich, 0)
          writeOverlay(staticWhich, 0)
        }
        return
      }

      // 空闲：会话收尾 + 双页归位 + 清除遮罩（静止态恒 0）
      if (sessionKeyRef.current !== null) {
        sessionKeyRef.current = null
        callbacksRef.current.onDragSessionChange(null)
      }
      writeTo('current', 0)
      writeTo('clone', 0)
      clearOverlays()
    }

    const schedule = (): void => batcher.schedule(applyFrame)

    const unsub = useReadingStore.subscribe((state, prev) => {
      if (
        state.dragOffset !== prev.dragOffset ||
        state.dragStartX !== prev.dragStartX ||
        state.globalPageIndex !== prev.globalPageIndex ||
        state.pageWidth !== prev.pageWidth ||
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    playSpring: ({ which, fromX, targetX, velocity = 0, onComplete, direction }) => {
      cancelSpring()
      writeTo(which, fromX)
      const v = Math.max(-MAX_SPRING_VELOCITY, Math.min(MAX_SPRING_VELOCITY, velocity))
      const staticWhich: 'current' | 'clone' = which === 'current' ? 'clone' : 'current'

      // phase-13 视差：弹簧起始帧也写静态页 + 遮罩
      if (direction !== undefined) {
        const s = useReadingStore.getState()
        if (s.pageWidth > 0) {
          const initStaticX = getCoverStaticParallaxX(fromX, s.pageWidth)
          const initOverlay = getCoverOverlayOpacity(fromX, s.pageWidth, direction)
          writeTo(staticWhich, initStaticX)
          writeOverlay(staticWhich, initOverlay)
        }
      }

      springRef.current = createSpringAnimation({
        from: fromX,
        to: targetX,
        velocity: v,
        onUpdate: (x) => {
          writeTo(which, x)
          // phase-13 视差：弹簧每帧同步更新静态页
          if (direction !== undefined) {
            const s = useReadingStore.getState()
            if (s.pageWidth > 0) {
              writeTo(staticWhich, getCoverStaticParallaxX(x, s.pageWidth))
              writeOverlay(staticWhich, getCoverOverlayOpacity(x, s.pageWidth, direction))
            }
          }
        },
        onComplete: () => {
          springRef.current = null
          onComplete()
          // 落幕同步归位：onComplete（finalizeAnim）已同步完成结构重排
          // （提交转正/回弹卸载克隆），空闲态双页立即回静止位
          const s = useReadingStore.getState()
          if (!s.flipAnimating && s.dragOffset === 0) {
            writeTo('current', 0)
            writeTo('clone', 0)
            clearOverlays()
          }
        }
      })
    },
    cancelSpring
  }
}
