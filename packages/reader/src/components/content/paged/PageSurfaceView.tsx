/**
 * 单页容器组件（PageSurface 的渲染载体）— phase-10 新增。
 *
 * 页尺寸 overflow:hidden 盒 + 内容切片 translateX(-localPageIndex × stride)。
 * 可承载两种内容：
 * - 规范流本体（当前页容器，children 为真实章 body，划线/批注/选词/跳转全部作用其上）；
 * - 相邻页克隆（cloneHostRef 空宿主，由 usePageClones 注入 cloneNode DOM）。
 *
 * phase-11：整页 transform/transition 移出 JSX，由 useCoverMotionBridge 经
 * rootRef 命令式独占写入（拖拽跟手 rAF 直写 + 弹簧动画）；本组件只保留
 * z 序/阴影 class/CSS 变量/切片位移等结构属性。
 *
 * phase-12 perf: React.memo 包裹，避免 PagedReader 低频结构渲染时
 * 两个 PageSurfaceView 的无谓 re-render（props 多为原始值/稳定引用，diff 成本低）。
 *
 * 下期仿真翻页（page-flip）以本组件作为页级渲染接入点。
 */
import { memo, type CSSProperties, type ReactNode, type RefObject } from 'react'

export interface PageSurfaceViewProps {
  /** 层叠顺序：底层静止页 1 / 顶层移动页 2（resolveCoverLayers 的 z 序约定） */
  zIndex: number
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
  /** 页容器根元素 ref：运动桥接命令式写入 transform 的触点 */
  rootRef?: RefObject<HTMLDivElement | null>
  children?: ReactNode
}

export const PageSurfaceView = memo(function PageSurfaceView(props: PageSurfaceViewProps): ReactNode {
  const {
    zIndex,
    moving,
    sliceTranslateX,
    pageWidth,
    pageStride,
    segmentId,
    cloneHostRef,
    rootRef,
    children
  } = props

  const pageStyle = {
    zIndex,
    '--page-width': `${pageWidth}px`,
    '--page-stride': `${pageStride}px`
  } as CSSProperties

  const sliceStyle: CSSProperties = {
    transform: `translateX(${sliceTranslateX}px)`
  }

  return (
    <div
      ref={rootRef}
      className={`paged-reader__page${cloneHostRef ? ' paged-reader__page--clone' : ''}${moving ? ' paged-reader__page--moving' : ''}`}
      style={pageStyle}
      data-segment-id={segmentId}
    >
      <div className="paged-reader__slice" style={sliceStyle} ref={cloneHostRef}>
        {children}
      </div>
    </div>
  )
})
