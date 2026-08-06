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
 *
 * phase-14 仿真翻页：新增第二个克隆槽（flap 槽）——
 * - next：主槽 = 下一页（底层显露区 clip），flap 槽 = 当前页折角副本（clip+transform）；
 * - prev：flap 槽 = 上一页（翻页页）；主槽仅提交落幕时挂遮盖层（两阶段转正）；
 * - 首末页阻尼：flap 槽 = 当前页副本（小幅折角回弹）。
 * 两槽完全独立（各自 host ref / 幂等 show/clear），cover 模式只用主槽。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { PageSurface } from '../../../core/pages'

export interface UsePageClonesInput {
  /** 取某章规范流 body（reader-content__body--columns），克隆源 */
  getSegmentBody: (chapterId: number) => Element | null
}

export interface UsePageClonesResult {
  /** 当前存活主克隆对应的页单元（无克隆为 null） */
  activeClone: PageSurface | null
  /** 主克隆宿主（PageSurfaceView 的 slice 空 div），克隆 DOM append 其中 */
  cloneHostRef: RefObject<HTMLDivElement | null>
  /** 创建/切换主克隆；同 key 幂等 */
  showClone: (surface: PageSurface) => void
  /** 销毁主克隆；幂等 */
  clearClone: () => void
  /** 当前存活 flap 克隆对应的页单元（phase-14 仿真翻页翻页页槽位） */
  activeFlapClone: PageSurface | null
  /** flap 克隆宿主 */
  flapCloneHostRef: RefObject<HTMLDivElement | null>
  /** 创建/切换 flap 克隆；同 key 幂等 */
  showFlapClone: (surface: PageSurface) => void
  /** 销毁 flap 克隆；幂等 */
  clearFlapClone: () => void
}

/** 单个克隆槽：surface state + host ref + DOM 注入副作用 */
function useCloneSlot(getSegmentBody: (chapterId: number) => Element | null): {
  active: PageSurface | null
  hostRef: RefObject<HTMLDivElement | null>
  show: (surface: PageSurface) => void
  clear: () => void
} {
  const [active, setActive] = useState<PageSurface | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<PageSurface | null>(null)

  const show = useCallback((surface: PageSurface) => {
    if (activeRef.current?.key === surface.key) return
    activeRef.current = surface
    setActive(surface)
  }, [])

  const clear = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = null
    setActive(null)
  }, [])

  // DOM 注入：active 变化 → 对目标章规范流 cloneNode(true) 挂入宿主；cleanup 移除。
  // 克隆节点自动携带内联列宽样式与已应用的 mark 包裹；--page-width/--page-stride
  // CSS 变量由 PageSurfaceView 页容器内联提供（继承给克隆）。
  useEffect(() => {
    const host = hostRef.current
    if (!host || !active) return undefined
    const source = getSegmentBody(active.chapterId)
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
  }, [active, getSegmentBody])

  return { active, hostRef, show, clear }
}

export function usePageClones(input: UsePageClonesInput): UsePageClonesResult {
  const { getSegmentBody } = input
  const main = useCloneSlot(getSegmentBody)
  const flap = useCloneSlot(getSegmentBody)

  return {
    activeClone: main.active,
    cloneHostRef: main.hostRef,
    showClone: main.show,
    clearClone: main.clear,
    activeFlapClone: flap.active,
    flapCloneHostRef: flap.hostRef,
    showFlapClone: flap.show,
    clearFlapClone: flap.clear
  }
}
