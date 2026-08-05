/**
 * 相邻页克隆生命周期 hook — phase-10 覆盖模式。
 *
 * 克隆策略（方案 A）：
 * - 时机：轴锁定为 x 且方向确定后的首次 move（PagedReader 在 dragOffset 变向时调用
 *   showClone），或点击分区翻页启动补间动画时；点击/竖滑不产生克隆。
 * - 来源：目标章规范流（当前页容器内的本体或隐藏测量流）cloneNode(true)——
 *   已含 applyMarks 划线/批注包裹与内联列宽样式，视觉自然正确，零映射成本。
 * - 标记：aria-hidden + inert + data-clone + pointer-events:none（CSS 整层禁交互），
 *   不注册 bodyMap、不参与选区与点击。
 * - 销毁：提交/回弹补间落幕 + 新规范流转正（marks ready）后由 PagedReader clearClone。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { PageSurface } from '../../../core/pages'

export interface UsePageClonesInput {
  /** 取某章规范流 body（reader-content__body--columns），克隆源 */
  getSegmentBody: (chapterId: number) => Element | null
}

export interface UsePageClonesResult {
  /** 当前存活克隆对应的页单元（无克隆为 null） */
  activeClone: PageSurface | null
  /** 克隆宿主（PageSurfaceView 的 slice 空 div），克隆 DOM append 其中 */
  cloneHostRef: RefObject<HTMLDivElement | null>
  /** 创建/切换克隆；同 key 幂等 */
  showClone: (surface: PageSurface) => void
  /** 销毁克隆；幂等 */
  clearClone: () => void
}

export function usePageClones(input: UsePageClonesInput): UsePageClonesResult {
  const { getSegmentBody } = input
  const [activeClone, setActiveClone] = useState<PageSurface | null>(null)
  const cloneHostRef = useRef<HTMLDivElement | null>(null)
  const activeCloneRef = useRef<PageSurface | null>(null)

  const showClone = useCallback((surface: PageSurface) => {
    if (activeCloneRef.current?.key === surface.key) return
    activeCloneRef.current = surface
    setActiveClone(surface)
  }, [])

  const clearClone = useCallback(() => {
    if (!activeCloneRef.current) return
    activeCloneRef.current = null
    setActiveClone(null)
  }, [])

  // DOM 注入：activeClone 变化 → 对目标章规范流 cloneNode(true) 挂入宿主；cleanup 移除。
  // 克隆节点自动携带内联列宽样式与已应用的 mark 包裹；--page-width/--page-stride
  // CSS 变量由 PageSurfaceView 页容器内联提供（继承给克隆）。
  useEffect(() => {
    const host = cloneHostRef.current
    if (!host || !activeClone) return undefined
    const source = getSegmentBody(activeClone.chapterId)
    if (!source) return undefined
    const clone = source.cloneNode(true) as HTMLElement
    clone.setAttribute('aria-hidden', 'true')
    clone.setAttribute('inert', '')
    clone.setAttribute('data-clone', 'true')
    clone.style.pointerEvents = 'none'
    host.appendChild(clone)
    return () => {
      if (clone.parentNode === host) {
        host.removeChild(clone)
      }
    }
  }, [activeClone, getSegmentBody])

  return { activeClone, cloneHostRef, showClone, clearClone }
}
