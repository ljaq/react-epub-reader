/**
 * 平移模式运动桥接（phase-11）— track transform 的命令式独占写入。
 *
 * 替代原「dragOffset → setState → 组件 re-render → trackStyle diff」热路径：
 * - vanilla subscribe reading-store（不经 React），rAF 合帧后命令式写
 *   track.style.transform；拖拽期间 HorizontalReader 零 re-render；
 * - 提交/回弹/点击翻页：弹簧动画驱动（createSpringAnimation），初速度取
 *   store.dragReleaseVelocity（消费后复位），速度连续、可被打断；
 * - 打断：弹簧飞行中开始新拖拽（dragOffset 变非零）→ cancel 弹簧直写跟手位；
 * - 抑制（boot 遮罩 / rebalance / layoutLocked / loading / silentExpand）：
 *   直写终值不动画，对齐原 suppressTransition 语义；
 * - 单写者原则：track 的 transform 由本桥接独占，JSX 不再设置。
 */
import { useEffect, useRef, type RefObject } from 'react'
import { getTrackTranslateX } from '../core/pagination'
import { createSpringAnimation, type SpringAnimation } from '../core/motion'
import { useReadingStore } from '../store/reading-store'
import { createRafBatcher } from './raf-batcher'

/** 弹簧初速度上限（px/ms ≈ 6000px/s）：极端甩动不至于动画不可读 */
const MAX_SPRING_VELOCITY = 6

export interface UseSlideMotionBridgeInput {
  /** track 元素（.reader-content__track） */
  trackRef: RefObject<HTMLDivElement | null>
  /** 组件侧额外抑制条件（如 boot 遮罩可见期）：返回 true 时直写不动画 */
  isSuppressedExtra?: () => boolean
}

export interface SlideMotionBridge {
  /** 请求下一帧重算写入（组件本地抑制条件变化时调用） */
  requestSync: () => void
}

export function useSlideMotionBridge(input: UseSlideMotionBridgeInput): SlideMotionBridge {
  const { trackRef, isSuppressedExtra } = input
  const extraRef = useRef(isSuppressedExtra)
  extraRef.current = isSuppressedExtra

  const batcherRef = useRef<ReturnType<typeof createRafBatcher> | null>(null)
  if (!batcherRef.current) batcherRef.current = createRafBatcher()

  const springRef = useRef<SpringAnimation | null>(null)
  const springTargetRef = useRef<number | null>(null)
  const currentXRef = useRef(0)
  const syncRef = useRef<() => void>(() => {})

  useEffect(() => {
    const batcher = batcherRef.current!

    const cancelSpring = (): void => {
      springRef.current?.cancel()
      springRef.current = null
      springTargetRef.current = null
    }

    const write = (x: number): void => {
      const track = trackRef.current
      if (!track) return
      currentXRef.current = x
      track.style.transform = `translateX(${x}px)`
    }

    const isSuppressed = (): boolean => {
      const s = useReadingStore.getState()
      return (
        Boolean(extraRef.current?.()) ||
        !s.bootContentReady ||
        s.isRebalancing ||
        s.layoutLocked ||
        s.buffer.loading ||
        s.buffer.silentExpand
      )
    }

    const applyFrame = (): void => {
      const s = useReadingStore.getState()
      if (s.pageStride <= 0) return
      const target = getTrackTranslateX(s.globalPageIndex, s.pageStride, s.dragOffset)

      // 跟手 / 抑制：直写不动画（抑制语义对齐原 suppressTransition）
      if (s.dragOffset !== 0 || isSuppressed()) {
        cancelSpring()
        if (currentXRef.current !== target) write(target)
        return
      }

      // 非拖拽：目标已在弹簧飞行中 → 不重启（含 buffer patch 等无关通知）
      if (springTargetRef.current === target) return
      if (currentXRef.current === target) {
        cancelSpring()
        return
      }

      // 提交/回弹/点击翻页：弹簧接管，消费松手速度后立即复位
      const fromX = currentXRef.current
      const rawV = s.dragReleaseVelocity
      if (rawV !== 0) s.setDragReleaseVelocity(0)
      const velocity = Math.max(-MAX_SPRING_VELOCITY, Math.min(MAX_SPRING_VELOCITY, rawV))
      cancelSpring()
      springTargetRef.current = target
      springRef.current = createSpringAnimation({
        from: fromX,
        to: target,
        velocity,
        onUpdate: write,
        onComplete: () => {
          springRef.current = null
          springTargetRef.current = null
          // 弹簧落定 = 翻页动画结束：复位翻页阴影（替代原 290ms 定时器语义）
          if (useReadingStore.getState().isFlipping) {
            useReadingStore.getState().setFlipping(false)
          }
        }
      })
    }

    const schedule = (): void => batcher.schedule(applyFrame)
    syncRef.current = schedule

    const unsub = useReadingStore.subscribe((state, prev) => {
      if (
        state.dragOffset !== prev.dragOffset ||
        state.globalPageIndex !== prev.globalPageIndex ||
        state.pageStride !== prev.pageStride ||
        state.isRebalancing !== prev.isRebalancing ||
        state.layoutLocked !== prev.layoutLocked ||
        state.bootContentReady !== prev.bootContentReady ||
        state.buffer !== prev.buffer ||
        state.dragReleaseVelocity !== prev.dragReleaseVelocity
      ) {
        schedule()
      }
    })

    // mount 立即写初始位（boot 定位，抑制期直写）
    schedule()

    return () => {
      syncRef.current = () => {}
      unsub()
      batcher.cancel()
      cancelSpring()
    }
  }, [trackRef])

  return { requestSync: () => syncRef.current() }
}
