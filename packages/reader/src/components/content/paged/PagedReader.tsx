/**
 * 覆盖模式阅读器（掌阅级）— phase-10 新增，方案 A：隐藏规范流 + 窗口化克隆页。
 *
 * 与平移模式（HorizontalReader）的关系：
 * - 两条渲染路径共享 buffer / pagination / 手势 / 划线层纯函数与 hook，平移路径零改动；
 * - 当前页 = 规范流本体：当前页容器（overflow:hidden 页尺寸盒）直接持有当前章
 *   完整多列排版流，translateX(-localPageIndex × stride) 显示对应页切片，
 *   划线/批注/选词/跳转锚点零迁移（posInfo 锚定、applyMarks、nav-target 均作用其上）；
 * - 相邻页 = 短命克隆切片（usePageClones）：左滑时下一页静止在底层、当前页向左滑出；
 *   右滑时当前页静止在底层、上一页从左侧滑入盖住当前页，移动页带前缘阴影；
 * - 邻居章规范流挂载在 offscreen 隐藏测量区（visibility:hidden），供 usePagination
 *   沿用 scrollWidth 法测量、并作为克隆源；
 * - 提交/回弹判定复用 resolveGlobalDragTurn（阈值 40，与平移一致）；时长/缓动 280ms
 *   ease-out；首末页沿用 applyGlobalDragResistance 阻尼（不建克隆，当前页衰减位移）；
 * - 动画期缓冲锁：补间进行中 flipAnimating=true 禁止 rebalance/silentExpand 滑动
 *   buffer 窗口，提交落幕补跑 scheduleBufferRebalance；
 * - 跨章提交两阶段转正：先提交页码让新章规范流挂载（克隆层盖在上面遮闪烁），
 *   registerBody 触发 applyMarks 后再撤克隆；
 * - 快速连滑/连点：补间未落幕又来新手势或新提交时，当前动画无过渡落定
 *   （提交即完成、回弹即归位），手势立即接管后续翻页，无需等待动画结束。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ChapterContent, ChapterMeta } from '../../../types'
import type { SelectionBridgeHandle } from '../../overlays/selection/SelectionLayer'
import {
  getAdjacentChapterId,
  getLastChapterPageGlobal,
  localToGlobal
} from '../../../core/chapter-buffer'
import { getChapterNavFlags, wrapChapterHtmlWithNav } from '../../../core/chapter-nav'
import type { DragTurnResult } from '../../../core/pagination'
import {
  getCoverCommitTargetX,
  getCoverMovingTranslateX,
  getCoverRestingX,
  type CoverDirection
} from '../../../core/flip'
import { resolveAdjacentPageSurface, resolvePageSurface, type PageSurface } from '../../../core/pages'
import { useReadingStore } from '../../../store/reading-store'
import { useTouchFlip } from '../../../hooks/useTouchFlip'
import { usePagination } from '../../../hooks/usePagination'
import { useContentStyles } from '../../../hooks/useContentStyles'
import { useTrialEndTip } from '../../../hooks/useTrialEndTip'
import { useContentRichMedia } from '../../../hooks/useContentRichMedia'
import { scheduleBufferRebalance } from '../../../hooks/buffer-rebalance-bridge'
import { BOOT_LOADING_FADE_MS } from '../../../hooks/useNavigateToNavTarget'
import { PageSurfaceView, COVER_TRANSITION_MS } from './PageSurfaceView'
import { usePageClones } from './usePageClones'
import '../reader-content.css'
import './paged-reader.css'

/** 补间落幕兜底：transitionend 未触发时强制收尾（时长 + 余量） */
const ANIM_FINALIZE_FALLBACK_MS = COVER_TRANSITION_MS + 60

/** 覆盖补间动画状态机：drag →（松手/点击）→ animating → finalize */
interface CoverAnimState {
  direction: CoverDirection
  /** true=提交（补间到终点后页码 ±1）；false=回弹（补间回静止位/原点） */
  commit: boolean
  /** 动画起点位移：拖拽松手=当前跟手位移；点击=静止位 */
  fromX: number
  /** 已进入补间（双 rAF 后 true，移动页从 fromX 过渡到目标位） */
  started: boolean
  /** 相邻页单元（克隆目标）；首末页阻尼回弹为 null */
  adjacent: PageSurface | null
}

export interface PagedReaderProps {
  chapterList: ChapterMeta[]
  chapters: Record<number, ChapterContent>
  isChapterBlocked: (chapterId: number) => boolean
  onChapterChange?: (chapterId: number, width: number) => void
  onError?: (payload: { scope: string; message: string }) => void
  selectionBridgeRef?: RefObject<SelectionBridgeHandle | null>
  registerBody?: (chapterId: number, el: Element | null) => void
  registerViewport?: (el: HTMLElement | null) => void
  registerScrollRoot?: (el: HTMLElement | null) => void
  paidChapterStart?: number
  isLoggedIn?: boolean
  onLinkClick?: (href: string) => void
}

export function PagedReader(props: PagedReaderProps): React.ReactNode {
  const {
    chapterList,
    chapters,
    isChapterBlocked,
    onChapterChange,
    onError,
    selectionBridgeRef,
    registerBody,
    registerViewport,
    registerScrollRoot,
    paidChapterStart,
    isLoggedIn = false,
    onLinkClick
  } = props

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const segmentBodyMapRef = useRef<Map<number, Element>>(new Map())

  const globalPageIndex = useReadingStore((s) => s.globalPageIndex)
  const dragOffset = useReadingStore((s) => s.dragOffset)
  const dragStartX = useReadingStore((s) => s.dragStartX)
  const buffer = useReadingStore((s) => s.buffer)
  const pageStride = useReadingStore((s) => s.pageStride)
  const pageWidth = useReadingStore((s) => s.pageWidth)
  const pageGap = useReadingStore((s) => s.pageGap)
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageCount = useReadingStore((s) => s.pageCount)
  const bootContentReady = useReadingStore((s) => s.bootContentReady)
  const setGlobalPageIndex = useReadingStore((s) => s.setGlobalPageIndex)

  const { rootStyle, contentBodyStyle } = useContentStyles()

  // 覆盖补间状态（低频：每次翻页仅 开始/started/落幕 三次 setState，跟手帧不进 state）
  const [animState, setAnimState] = useState<CoverAnimState | null>(null)
  const animStateRef = useRef<CoverAnimState | null>(null)
  animStateRef.current = animState
  // 提交落幕后克隆层继续盖住新规范流，待 body 挂载 + applyMarks 后撤下（两阶段转正）
  const [settlingClone, setSettlingClone] = useState(false)

  const segmentColumnStyle: React.CSSProperties = pageWidth > 0
    ? { columnWidth: `${pageWidth}px`, columnGap: `${pageGap}px` }
    : {}

  const getSegmentBody = useCallback((id: number): Element | null => {
    return segmentBodyMapRef.current.get(Number(id)) ?? null
  }, [])

  const { activeClone, cloneHostRef, showClone, clearClone } = usePageClones({ getSegmentBody })

  const { runInitialLayout, getFetchWidth } = usePagination({
    enabled: true,
    viewportRef,
    getSegmentBody,
    isChapterBlocked
  })

  // ── 覆盖动画状态机 ──

  const finalizeAnim = useCallback(() => {
    const anim = animStateRef.current
    if (!anim) return
    animStateRef.current = null
    const state = useReadingStore.getState()
    if (anim.commit) {
      // 两阶段转正：先提交页码（新章/新页规范流挂载），克隆层留顶遮盖，
      // 由 settlingClone effect 在 marks ready 后撤下
      state.setGlobalPageIndex(state.globalPageIndex + anim.direction)
      setSettlingClone(true)
      setAnimState(null)
      state.setDragOffset(0)
      state.setFlipAnimating(false)
      state.setFlipping(false)
      // 动画期缓冲锁解除后补跑 ensureBuffer（±1 章窗口滑动）
      scheduleBufferRebalance()
    } else {
      setAnimState(null)
      clearClone()
      state.setDragOffset(0)
      state.setFlipAnimating(false)
      state.setFlipping(false)
      if (useReadingStore.getState().buffer.silentExpand) {
        scheduleBufferRebalance()
      }
    }
  }, [clearClone])

  const startAnim = useCallback(
    (anim: Omit<CoverAnimState, 'started'>) => {
      const state = useReadingStore.getState()
      state.setFlipAnimating(true)
      // 复位拖拽残留位移：fromX 已捕获松手位置，补间由 animState 驱动；
      // 否则拖拽跟手 effect 会把残留 dragOffset 误判为「新拖拽打断」而同帧落定动画
      state.setDragOffset(0)
      if (anim.adjacent) showClone(anim.adjacent)
      setAnimState({ ...anim, started: false })
    },
    [showClone]
  )

  // useTouchFlip 覆写点：拖拽松手判定与点击分区翻页 → 覆盖动画提交/回弹
  const handleTurnPage = useCallback(
    (action: DragTurnResult, lastDx: number): boolean => {
      // 快速连滑/连点：补间未落幕又来新提交 → 先把当前动画无过渡落定，再处理新提交
      if (animStateRef.current) finalizeAnim()
      const state = useReadingStore.getState()
      const pw = state.pageWidth
      if (pw <= 0) return false
      const current = resolvePageSurface(state.globalPageIndex, state.buffer)
      if (!current) return false

      if (action === 'stay') {
        // 未过阈值回弹；无位移（理论不可达）走默认收尾
        if (state.dragOffset === 0) return false
        const direction: CoverDirection = state.dragOffset < 0 ? 1 : -1
        const adjacent = resolveAdjacentPageSurface(current, direction, state.buffer)
        const fromX = getCoverMovingTranslateX({
          direction,
          dragOffset: state.dragOffset,
          pageWidth: pw,
          hasAdjacent: adjacent !== null,
          dragStartX: state.dragStartX
        })
        startAnim({ direction, commit: false, fromX, adjacent })
        return true
      }

      const direction: CoverDirection = action === 'next-page' ? 1 : -1
      const adjacent = resolveAdjacentPageSurface(current, direction, state.buffer)
      if (!adjacent) {
        // 首末页：点击边界 → 默认 turnPage 边界钳制 no-op
        // （拖拽越界由 resolveGlobalDragTurn 判 stay，走上方回弹分支）
        return false
      }
      const fromX =
        lastDx !== 0
          ? getCoverMovingTranslateX({
              direction,
              dragOffset: state.dragOffset,
              pageWidth: pw,
              hasAdjacent: true,
              dragStartX: state.dragStartX
            })
          : getCoverRestingX(direction, pw)
      startAnim({ direction, commit: true, fromX, adjacent })
      return true
    },
    [startAnim, finalizeAnim]
  )

  const { handlers: dragHandlers, onClick } = useTouchFlip({
    enabled: true,
    // 不拦截补间期间的新手势：快速连滑由「打断落定」接管（见拖拽跟手 effect）
    shouldBlock: () => selectionBridgeRef?.current?.shouldBlockFlip() ?? false,
    onTurnPage: handleTurnPage
  })

  // 补间启动：首帧渲染 fromX（无过渡）→ 双 rAF 后 started=true（过渡到目标位）
  useEffect(() => {
    if (!animState || animState.started) return undefined
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setAnimState((s) => (s && !s.started ? { ...s, started: true } : s))
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [animState])

  // 补间落幕兜底（transitionend 未触发时）
  useEffect(() => {
    if (!animState?.started) return undefined
    const timer = window.setTimeout(finalizeAnim, ANIM_FINALIZE_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [animState?.started, finalizeAnim])

  // 两阶段转正收尾：克隆盖顶期间 registerBody 已触发 applyMarks（rAF），
  // 双 rAF 后撤克隆（effect 晚于 ref 回调执行，applyMarks 的 rAF 先注册先跑）
  useEffect(() => {
    if (!settlingClone) return undefined
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        clearClone()
        setSettlingClone(false)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [settlingClone, clearClone])

  // 拖拽跟手：轴锁定 x 且方向确定后（dragOffset 变非零）首次 move 建相邻页克隆；
  // 点击/竖滑不产生克隆。快速连滑：补间未落幕就开始新拖拽 → 首个 move 把当前动画
  // 无过渡落定（提交即完成、回弹即归位），手势立即接管后续翻页。
  useEffect(() => {
    if (animState) {
      if (dragOffset !== 0) finalizeAnim()
      return
    }
    if (dragOffset === 0) {
      if (!settlingClone) clearClone()
      return
    }
    if (settlingClone) {
      // 新拖拽打断转正遮盖收尾：取消待执行的撤克隆，避免误删新拖拽的克隆
      setSettlingClone(false)
    }
    const state = useReadingStore.getState()
    const current = resolvePageSurface(state.globalPageIndex, state.buffer)
    if (!current) return
    const direction: CoverDirection = dragOffset < 0 ? 1 : -1
    const adjacent = resolveAdjacentPageSurface(current, direction, state.buffer)
    if (adjacent) showClone(adjacent)
    else clearClone()
  }, [dragOffset, animState, settlingClone, showClone, clearClone, finalizeAnim])

  const { syncTrialEndTip } = useTrialEndTip({ isLoggedIn, paidChapterStart })
  const { handleRichMediaTap, hideFootnoteOnTouchMove } = useContentRichMedia({ onLinkClick })

  useEffect(() => {
    syncTrialEndTip()
  }, [chapterId, globalPageIndex, pageCount, syncTrialEndTip])

  const initedLayoutRef = useRef(false)
  useEffect(() => {
    if (initedLayoutRef.current) return
    if (!buffer.order.length) return
    initedLayoutRef.current = true
    void runInitialLayout()
  }, [buffer.order.length, runInitialLayout])

  // 首屏遮罩（对齐 HorizontalReader：boot/layoutLocked 机制消除章切换瞬间闪烁）
  const [bootOverlayVisible, setBootOverlayVisible] = useState(true)
  const [bootOverlayLeaving, setBootOverlayLeaving] = useState(false)

  useEffect(() => {
    if (!bootContentReady) {
      setBootOverlayVisible(true)
      setBootOverlayLeaving(false)
      return
    }
    if (!bootOverlayVisible || bootOverlayLeaving) return
    setBootOverlayLeaving(true)
  }, [bootContentReady, bootOverlayVisible, bootOverlayLeaving])

  useEffect(() => {
    if (!bootOverlayLeaving) return undefined
    const timer = window.setTimeout(() => setBootOverlayVisible(false), BOOT_LOADING_FADE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [bootOverlayLeaving])

  // ── 层级与位移计算（core/flip 纯函数） ──

  const currentSurface = resolvePageSurface(globalPageIndex, buffer)
  const localPageIndex = currentSurface?.localPageIndex ?? 0

  const direction: CoverDirection =
    animState?.direction ?? (dragOffset < 0 ? 1 : -1)
  // 「是否有相邻页」渲染期同步推导（勿用 activeClone state：克隆 DOM 挂载有一帧延迟，
  // 右滑首帧会误判无相邻页 → 当前页被当成移动页直通正值 dragOffset，底层页向右闪一帧）
  const adjacentSurface = animState
    ? animState.adjacent
    : currentSurface && dragOffset !== 0
      ? resolveAdjacentPageSurface(currentSurface, direction, buffer)
      : null
  const hasAdjacent = adjacentSurface !== null

  const animTargetX = animState
    ? animState.commit
      ? getCoverCommitTargetX(animState.direction, pageWidth)
      : animState.adjacent
        ? getCoverRestingX(animState.direction, pageWidth)
        : 0 // 首末页阻尼回弹归位
    : 0

  const movingX = animState
    ? animState.started
      ? animTargetX
      : animState.fromX
    : dragOffset !== 0
      ? getCoverMovingTranslateX({ direction, dragOffset, pageWidth, hasAdjacent, dragStartX })
      : 0

  // next：当前页滑出（动）；prev：上一页克隆滑入（动）；无相邻页（首末页阻尼）：当前页动
  const currentIsMoving = direction === 1 || !hasAdjacent
  // 提交落幕后的转正期克隆恒在顶层遮盖；新拖拽已开始则立即失效（避免盖住跟手的当前页）
  const settling = settlingClone && dragOffset === 0 && !animState
  const cloneOnTop = settling || !currentIsMoving
  const showMovingShadow = dragOffset !== 0 || animState !== null
  // 克隆渲染与当前相邻页推导对齐：拖拽中途换向时，旧方向克隆在 effect 换新前
  // 会有一帧错位（层级/位移已按新方向计算），直接不渲染该帧
  const cloneVisible =
    activeClone !== null &&
    (settling || (adjacentSurface !== null && activeClone.key === adjacentSurface.key))

  const handleMovingTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.propertyName !== 'transform') return
      finalizeAnim()
    },
    [finalizeAnim]
  )

  // ── 章首/章末「上一章/下一章」按钮（原样保留平移模式行为：即时跳转） ──

  const flags = getChapterNavFlags(chapterList, chapterId)
  const goToAdjacentChapter = useCallback(
    (dir: 1 | -1) => {
      const nextId = getAdjacentChapterId(chapterList, chapterId, dir)
      if (!nextId) return
      const state = useReadingStore.getState()
      const segment = state.buffer.segments[nextId]
      if (segment) {
        const targetPage = dir > 0 ? 0 : Math.max(0, (segment.pageCount || 1) - 1)
        setGlobalPageIndex(localToGlobal(nextId, targetPage, state.buffer))
        return
      }
      onChapterChange?.(nextId, getFetchWidth())
    },
    [chapterList, chapterId, setGlobalPageIndex, onChapterChange, getFetchWidth]
  )

  const atBookStart =
    buffer.order.length > 0 && chapterId === buffer.order[0] && globalPageIndex <= 0
  const lastChapterInBuffer = buffer.order[buffer.order.length - 1]
  const atBookEnd =
    buffer.order.length > 0 &&
    chapterId === lastChapterInBuffer &&
    globalPageIndex >= getLastChapterPageGlobal(lastChapterInBuffer, buffer)

  const setBodyRef = (id: number) => (el: Element | null) => {
    if (el) segmentBodyMapRef.current.set(id, el)
    else segmentBodyMapRef.current.delete(id)
    registerBody?.(id, el)
  }

  const segmentHtml = useCallback(
    (id: number): string => {
      const raw = buffer.segments[id]?.html || ''
      return wrapChapterHtmlWithNav(chapterList, id, raw)
    },
    [buffer.segments, chapterList]
  )

  /** 章内容流（规范流本体）：当前页容器与隐藏测量区共用同一渲染 */
  const renderChapterFlow = (id: number): React.ReactNode => {
    if (isChapterBlocked(id)) {
      return <ChapterBlockedBody chapterId={id} chapterList={chapterList} />
    }
    const html = segmentHtml(id)
    if (!html) {
      return <ChapterSkeleton />
    }
    return (
      <div
        ref={setBodyRef(id)}
        className="reader-content__body reader-content__body--columns read_c"
        style={{ ...contentBodyStyle, ...segmentColumnStyle }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      const bridge = selectionBridgeRef?.current
      const target = e.target as HTMLElement

      const noteBadge = target.closest('.reader-note-badge')
      if (noteBadge && bridge) {
        bridge.handleNoteBadgeClick(e, noteBadge as HTMLElement)
        return
      }

      const lineMark = target.closest('.reader-line-mark')
      if (lineMark && bridge) {
        e.stopPropagation()
        e.preventDefault()
        const segId = Number(lineMark.closest('[data-segment-id]')?.getAttribute('data-segment-id'))
        bridge.handleLineMarkClick(lineMark as HTMLElement, segId || chapterId)
        return
      }

      if (bridge?.shouldIgnoreTap(e)) return

      if (handleRichMediaTap(e)) return

      onClick(e)
    },
    [selectionBridgeRef, onClick, chapterId, handleRichMediaTap]
  )

  void chapters
  void onError

  return (
    <div
      className={`reader-content reader-content--horizontal reader-content--paged${bootOverlayVisible ? ' reader-content--chapter-loading' : ''}`}
      style={rootStyle}
      onClick={handleContentClick}
      onTouchMove={hideFootnoteOnTouchMove}
      ref={(el) => registerScrollRoot?.(el)}
    >
      <div
        ref={(el) => {
          viewportRef.current = el
          registerViewport?.(el)
        }}
        className="reader-content__viewport-h"
        {...dragHandlers}
      >
        {/* 邻居章隐藏测量流（visibility:hidden，供 scrollWidth 测量 + 克隆源） */}
        <div className="paged-reader__hidden-flows" aria-hidden="true">
          {buffer.order
            .filter((id) => Number(id) !== Number(chapterId))
            .map((id) => (
              <div
                key={id}
                className="paged-reader__hidden-flow"
                data-segment-id={id}
                style={{
                  '--page-width': `${pageWidth}px`,
                  '--page-stride': `${pageStride}px`
                } as React.CSSProperties}
              >
                {renderChapterFlow(id)}
              </div>
            ))}
        </div>

        {/* 相邻页克隆层（短命）：next=底层静止 / prev=顶层滑入 / 提交落幕遮盖转正 */}
        {cloneVisible && activeClone && (
          <PageSurfaceView
            zIndex={cloneOnTop ? 2 : 1}
            translateX={currentIsMoving ? 0 : movingX}
            animated={Boolean(animState?.started) && !currentIsMoving}
            moving={!currentIsMoving && showMovingShadow}
            sliceTranslateX={-activeClone.localPageIndex * pageStride}
            pageWidth={pageWidth}
            pageStride={pageStride}
            cloneHostRef={cloneHostRef}
            onMovingTransitionEnd={handleMovingTransitionEnd}
          />
        )}

        {/* 当前页容器：规范流本体（划线/批注/选区/跳转唯一作用对象） */}
        <PageSurfaceView
          zIndex={cloneOnTop ? 1 : 2}
          translateX={currentIsMoving ? movingX : 0}
          animated={Boolean(animState?.started) && currentIsMoving}
          moving={currentIsMoving && showMovingShadow}
          sliceTranslateX={-localPageIndex * pageStride}
          pageWidth={pageWidth}
          pageStride={pageStride}
          segmentId={chapterId}
          onMovingTransitionEnd={handleMovingTransitionEnd}
        >
          {renderChapterFlow(chapterId)}
        </PageSurfaceView>

        {atBookStart && flags.hasPrev && (
          <div
            className="reader-chapter-btn-slot reader-chapter-btn-slot--prev"
            style={{ position: 'absolute', left: 0, top: 8, zIndex: 3 }}
          >
            <button
              type="button"
              className="reader-chapter-btn reader-chapter-btn--prev"
              data-chapter-nav="prev"
              onClick={(e) => {
                e.stopPropagation()
                goToAdjacentChapter(-1)
              }}
            >
              上一章
            </button>
          </div>
        )}
        {atBookEnd && flags.hasNext && (
          <div
            className="reader-chapter-btn-slot reader-chapter-btn-slot--next"
            style={{ position: 'absolute', right: 0, bottom: 12, zIndex: 3 }}
          >
            <button
              type="button"
              className="reader-chapter-btn reader-chapter-btn--next"
              data-chapter-nav="next"
              onClick={(e) => {
                e.stopPropagation()
                goToAdjacentChapter(1)
              }}
            >
              下一章
            </button>
          </div>
        )}
      </div>

      {bootOverlayVisible && (
        <div
          className={`reader-content__chapter-loading${bootOverlayLeaving ? ' is-leaving' : ''}`}
          aria-busy={!bootOverlayLeaving}
          aria-live="polite"
          onTransitionEnd={(e) => {
            if (e.propertyName !== 'opacity' || !bootOverlayLeaving) return
            setBootOverlayVisible(false)
          }}
        >
          <div className="reader-content__chapter-loading-mask" />
          <div className="reader-content__chapter-loading-spinner" />
        </div>
      )}
    </div>
  )
}

function ChapterSkeleton(): React.ReactNode {
  return (
    <div className="reader-content__skeleton" aria-busy="true" aria-live="polite">
      <div className="reader-content__skeleton-line" />
      <div className="reader-content__skeleton-line" />
      <div className="reader-content__skeleton-line" />
      <div className="reader-content__skeleton-line reader-content__skeleton-line--short" />
      <div className="reader-content__skeleton-line" />
      <div className="reader-content__skeleton-line" />
      <div className="reader-content__skeleton-line reader-content__skeleton-line--short" />
    </div>
  )
}

function ChapterBlockedBody(props: { chapterId: number; chapterList: ChapterMeta[] }): React.ReactNode {
  const meta = props.chapterList.find((c) => Number(c.id) === Number(props.chapterId))
  return (
    <div className="reader-content__skeleton">
      <div className="reader-content__skeleton-line reader-content__skeleton-line--short" />
      <p style={{ color: 'var(--reader-color)', opacity: 0.6, fontSize: 14 }}>
        {meta?.chapterName || `第${props.chapterId}章`} · 需登录或购买
      </p>
    </div>
  )
}
