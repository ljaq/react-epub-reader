/**
 * BottomSheet — 通用底部弹窗组件。
 *
 * 设计原则：
 * 1. 单一数据源 — 所有视觉态由 React state（offset/opacity）驱动，
 *    绝不混用 CSS class transition + inline style + transitionend 事件链。
 * 2. 进场/退场用 rAF + ease-out 缓动函数，避免 transition 与 setState 耦合。
 * 3. 手势跟手用 rAF 直接写 state（React 18 自动批处理 + 浏览器合成层）。
 * 4. 松手关闭/回弹用 spring 物理引擎或 rAF 缓动统一处理。
 *
 * Phase 状态机：
 *   idle → entering（rAF 进场动画）→ active
 *   active → dragging（手势跟手）→ active（回弹）/ exiting（关闭）
 *   active → exiting（rAF 退场动画 / spring 退场）→ idle
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSpringAnimation,
  PAGE_FLIP_SPRING
} from '../../core/motion/spring'
import './bottom-sheet.css'

export interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  height?: string
  maxHeight?: string
  zIndex?: number
  /** 关闭阈值比例（0-1），默认 0.3 */
  threshold?: number
  swipeToClose?: boolean
  maskClassName?: string
  sheetClassName?: string
}

type Phase = 'idle' | 'entering' | 'active' | 'dragging' | 'exiting'

const ANIM_DURATION_MS = 280

/** ease-out 缓动 */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function BottomSheet(props: BottomSheetProps): React.ReactNode {
  const {
    visible,
    onClose,
    children,
    height = '78vh',
    maxHeight = '78vh',
    zIndex = 10001,
    threshold = 0.3,
    swipeToClose = true
  } = props

  const [phase, setPhase] = useState<Phase>('idle')
  /** sheet 的 translateY（px），0 = 完全显示，sheetHeight = 完全隐藏 */
  const [offset, setOffset] = useState(0)
  /** mask 的 opacity，0 = 透明，1 = 完全显示 */
  const [maskOpacity, setMaskOpacity] = useState(0)

  const sheetRef = useRef<HTMLDivElement | null>(null)
  const maskRef = useRef<HTMLDivElement | null>(null)

  // 手势采样
  const gestureRef = useRef({
    startY: 0,
    startOffset: 0,
    lastY: 0,
    lastTime: 0,
    velocitySamples: [] as { dy: number; dt: number }[]
  })

  // rAF 动画句柄
  const rafRef = useRef<number | null>(null)
  // spring 句柄
  const springRef = useRef<ReturnType<typeof createSpringAnimation> | null>(null)

  // 稳定的 onClose ref
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  /** 取消所有正在进行的动画 */
  const cancelAllAnims = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (springRef.current) {
      springRef.current.cancel()
      springRef.current = null
    }
  }, [])

  /** 获取 sheet 高度（缓存读取） */
  const getSheetHeight = useCallback((): number => {
    return sheetRef.current?.offsetHeight ?? 0
  }, [])

  /** 用 rAF 驱动 ease-out 动画到目标 offset */
  const animateTo = useCallback(
    (
      fromOffset: number,
      toOffset: number,
      durationMs: number,
      onDone: () => void
    ) => {
      cancelAllAnims()
      const sheetHeight = getSheetHeight()
      const fromMask = sheetHeight > 0
        ? Math.max(0, 1 - fromOffset / sheetHeight)
        : 1
      const toMask = sheetHeight > 0
        ? Math.max(0, 1 - toOffset / sheetHeight)
        : 0
      const startTime = performance.now()

      const tick = () => {
        const elapsed = performance.now() - startTime
        const t = Math.min(1, elapsed / durationMs)
        const eased = easeOut(t)
        const curOffset = fromOffset + (toOffset - fromOffset) * eased
        const curMask = fromMask + (toMask - fromMask) * eased
        setOffset(curOffset)
        setMaskOpacity(curMask)

        if (t >= 1) {
          rafRef.current = null
          onDone()
        } else {
          rafRef.current = requestAnimationFrame(tick)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    },
    [cancelAllAnims, getSheetHeight]
  )

  // ======== 进场 ========
  useEffect(() => {
    if (!visible || phase !== 'idle') return
    const sheetHeight = getSheetHeight()
    setPhase('entering')
    animateTo(sheetHeight, 0, ANIM_DURATION_MS, () => {
      setPhase('active')
    })
  }, [visible, phase, animateTo, getSheetHeight])

  // ======== 退场（visible 变 false 时） ========
  useEffect(() => {
    if (visible || phase === 'idle' || phase === 'exiting') return
    const sheetHeight = getSheetHeight()
    setPhase('exiting')
    animateTo(offset, sheetHeight, ANIM_DURATION_MS, () => {
      setOffset(sheetHeight)
      setMaskOpacity(0)
      setPhase('idle')
      onCloseRef.current()
    })
    // 注意：offset 不放依赖，避免拖拽中频繁触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, phase, animateTo, getSheetHeight])

  // ======== 卸载清理 ========
  useEffect(() => {
    return () => cancelAllAnims()
  }, [cancelAllAnims])

  // ======== 手势 ========
  const getClientY = useCallback((e: TouchEvent | MouseEvent): number => {
    if ('touches' in e && e.touches.length > 0) return e.touches[0].clientY
    if ('changedTouches' in e && e.changedTouches.length > 0)
      return e.changedTouches[0].clientY
    return (e as MouseEvent).clientY
  }, [])

  const handlePointerDown = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!swipeToClose || phase !== 'active') return
      cancelAllAnims()

      const clientY = getClientY(e.nativeEvent)
      const now = performance.now()
      gestureRef.current = {
        startY: clientY,
        startOffset: offset,
        lastY: clientY,
        lastTime: now,
        velocitySamples: []
      }
      setPhase('dragging')
    },
    [swipeToClose, phase, offset, cancelAllAnims, getClientY]
  )

  useEffect(() => {
    if (phase !== 'dragging') return

    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!sheetRef.current) return
      const clientY = getClientY(e)
      const { startY, startOffset, lastY, lastTime } = gestureRef.current
      const now = performance.now()

      let deltaY = clientY - startY
      if (deltaY < 0) deltaY = 0

      const sheetHeight = sheetRef.current.offsetHeight
      const newOffset = Math.min(sheetHeight, startOffset + deltaY)
      setOffset(newOffset)
      setMaskOpacity(sheetHeight > 0 ? Math.max(0, 1 - newOffset / sheetHeight) : 0)

      // 速度采样
      const dt = now - lastTime
      if (dt > 0 && dt < 100) {
        const dy = clientY - lastY
        gestureRef.current.velocitySamples.push({ dy, dt })
        while (gestureRef.current.velocitySamples.length > 5) {
          gestureRef.current.velocitySamples.shift()
        }
      }
      gestureRef.current.lastY = clientY
      gestureRef.current.lastTime = now
    }

    const onEnd = () => {
      if (!sheetRef.current) return
      const sheetHeight = sheetRef.current.offsetHeight

      // 释放速度
      let velocity = 0
      const samples = gestureRef.current.velocitySamples
      if (samples.length > 0) {
        let totalDy = 0
        let totalDt = 0
        for (const s of samples) {
          totalDy += s.dy
          totalDt += s.dt
        }
        if (totalDt > 0) velocity = totalDy / totalDt
      }

      const dismissThreshold = sheetHeight * threshold
      const currentOffset = offset
      const shouldClose =
        currentOffset > dismissThreshold || velocity > 0.5

      if (shouldClose) {
        // spring 物理关闭
        cancelAllAnims()
        setPhase('exiting')
        springRef.current = createSpringAnimation({
          from: currentOffset,
          to: sheetHeight,
          velocity,
          config: PAGE_FLIP_SPRING,
          onUpdate: (y: number) => {
            setOffset(y)
            setMaskOpacity(
              sheetHeight > 0 ? Math.max(0, 1 - y / sheetHeight) : 0
            )
          },
          onComplete: () => {
            springRef.current = null
            setPhase('idle')
            onCloseRef.current()
          }
        })
      } else {
        // 回弹
        animateTo(currentOffset, 0, ANIM_DURATION_MS, () => {
          setPhase('active')
        })
      }
    }

    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)

    return () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
    }
  }, [phase, offset, threshold, cancelAllAnims, animateTo, getClientY])

  // ======== 遮罩点击关闭 ========
  const handleMaskClick = useCallback(() => {
    if (phase !== 'active') return
    onCloseRef.current()
  }, [phase])

  // ======== 渲染 ========
  if (!visible && phase === 'idle') return null

  const canInteract = phase === 'entering' || phase === 'active' || phase === 'dragging'

  const rootClass = [
    'bottomsheet-root',
    canInteract ? 'bottomsheet-root--interactive' : ''
  ].filter(Boolean).join(' ')

  const maskClass = [
    'bottomsheet-mask',
    props.maskClassName ?? ''
  ].filter(Boolean).join(' ')

  const sheetClass = [
    'bottomsheet-sheet',
    phase === 'dragging' ? 'bottomsheet-sheet--dragging' : '',
    props.sheetClassName ?? ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={rootClass}
      style={{ '--bottomsheet-z-index': zIndex } as React.CSSProperties}
    >
      <div
        ref={maskRef}
        className={maskClass}
        style={{ opacity: maskOpacity }}
        onClick={handleMaskClick}
      />
      <div
        ref={sheetRef}
        className={sheetClass}
        style={{
          height,
          maxHeight,
          overflow: 'hidden',
          transform: `translateY(${offset}px)`
        }}
        onTouchStart={handlePointerDown}
        onMouseDown={handlePointerDown}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
