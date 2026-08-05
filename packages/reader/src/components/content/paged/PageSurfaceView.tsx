/**
 * 单页容器组件（PageSurface 的渲染载体）— phase-10 新增。
 *
 * 页尺寸 overflow:hidden 盒 + 内容切片 translateX(-localPageIndex × stride)。
 * 可承载两种内容：
 * - 规范流本体（当前页容器，children 为真实章 body，划线/批注/选词/跳转全部作用其上）；
 * - 相邻页克隆（cloneHostRef 空宿主，由 usePageClones 注入 cloneNode DOM）。
 *
 * 下期仿真翻页（page-flip）以本组件作为页级渲染接入点。
 */
import type { CSSProperties, ReactNode, RefObject, TransitionEvent } from 'react'

/** 覆盖动画时长/缓动：对照 HorizontalReader TRANSITION_MS = 280 ease-out。 */
export const COVER_TRANSITION_MS = 280

export interface PageSurfaceViewProps {
  /** 层叠顺序：底层静止页 1 / 顶层移动页 2（resolveCoverLayers 的 z 序约定） */
  zIndex: number
  /** 整页位移（拖拽跟手/补间动画驱动，静止页恒 0） */
  translateX: number
  /** 是否启用 280ms ease-out 过渡（仅补间动画期；拖拽跟手期必须为 false） */
  animated: boolean
  /** 是否挂移动页前缘阴影（.paged-reader__page--moving） */
  moving: boolean
  /** 页内容切片位移：-localPageIndex × pageStride */
  sliceTranslateX: number
  /** CSS 变量 --page-width（克隆需与规范流同步，供内部样式换算） */
  pageWidth: number
  /** CSS 变量 --page-stride */
  pageStride: number
  /** 章 id：输出 data-segment-id，供划线点击/选区归属章换算（克隆层不需要） */
  segmentId?: number
  /** 克隆承载模式：slice 空宿主 ref，usePageClones 向其中 appendChild 克隆 DOM */
  cloneHostRef?: RefObject<HTMLDivElement | null>
  /** 补间结束回调（仅移动页会真正触发 transform 过渡） */
  onMovingTransitionEnd?: (e: TransitionEvent) => void
  children?: ReactNode
}

export function PageSurfaceView(props: PageSurfaceViewProps): ReactNode {
  const {
    zIndex,
    translateX,
    animated,
    moving,
    sliceTranslateX,
    pageWidth,
    pageStride,
    segmentId,
    cloneHostRef,
    onMovingTransitionEnd,
    children
  } = props

  const pageStyle = {
    zIndex,
    transform: `translateX(${translateX}px)`,
    transition: animated ? `transform ${COVER_TRANSITION_MS}ms ease-out` : 'none',
    '--page-width': `${pageWidth}px`,
    '--page-stride': `${pageStride}px`
  } as CSSProperties

  const sliceStyle: CSSProperties = {
    transform: `translateX(${sliceTranslateX}px)`
  }

  return (
    <div
      className={`paged-reader__page${cloneHostRef ? ' paged-reader__page--clone' : ''}${moving ? ' paged-reader__page--moving' : ''}`}
      style={pageStyle}
      data-segment-id={segmentId}
      onTransitionEnd={onMovingTransitionEnd}
    >
      <div className="paged-reader__slice" style={sliceStyle} ref={cloneHostRef}>
        {children}
      </div>
    </div>
  )
}
