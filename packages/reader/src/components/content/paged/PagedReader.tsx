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
 * - 提交/回弹判定复用 resolveGlobalDragTurn（阈值 40，与平移一致）；
 *   首末页沿用 applyGlobalDragResistance 阻尼（不建克隆，当前页衰减位移）；
 * - 动画期缓冲锁：补间进行中 flipAnimating=true 禁止 rebalance/silentExpand 滑动
 *   buffer 窗口，提交落幕补跑 scheduleBufferRebalance；
 * - 跨章提交两阶段转正：先提交页码让新章规范流挂载（克隆层盖在上面遮闪烁），
 *   registerBody 触发 applyMarks 后再撤克隆；
 * - 快速连滑/连点：弹簧未落幕又来新手势或新提交时，当前动画无过渡落定
 *   （提交即完成、回弹即归位），手势立即接管后续翻页，无需等待动画结束。
 *
 * phase-11 性能/手感改造：
 * - 双页 transform 由 useCoverMotionBridge 命令式独占写入：拖拽跟手走 vanilla
 *   subscribe + rAF 合帧直写，本组件不订阅 dragOffset，拖拽期间零 re-render；
 * - 补间动画为物理弹簧（core/motion）：松手带初速度、可打断落定；
 * - React 只承担低频结构渲染：克隆挂载/销毁（dragSession）、z 序换层、阴影 class、
 *   弹簧启停（animState，每次翻页 2-3 次 render）。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
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
import { PageSurfaceView } from './PageSurfaceView'
import { usePageClones } from './usePageClones'
import {
  useCoverMotionBridge,
  type CoverDragSession,
  type CoverMotionBridge
} from './useCoverMotionBridge'
import '../reader-content.css'
import './paged-reader.css'

/** 覆盖弹簧动画状态（低频：每次翻页仅启动/落幕两次 setState，跟手帧不进 state） */
interface CoverAnimState {
  direction: CoverDirection
  /** true=提交（弹簧到终点后页码 ±1）；false=回弹（弹簧回静止位/原点） */
  commit: boolean
  /** 动画起点位移：拖拽松手=当前跟手位移；点击=静止位 */
  fromX: number
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
  const currentRootRef = useRef<HTMLDivElement | null>(null)
  const cloneRootRef = useRef<HTMLDivElement | null>(null)
  const segmentBodyMapRef = useRef<Map<number, Element>>(new Map())

  const globalPageIndex = useReadingStore((s) => s.globalPageIndex)
  const buffer = useReadingStore((s) => s.buffer)
  const pageStride = useReadingStore((s) => s.pageStride)
  const pageWidth = useReadingStore((s) => s.pageWidth)
  const pageGap = useReadingStore((s) => s.pageGap)
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageCount = useReadingStore((s) => s.pageCount)
  const bootContentReady = useReadingStore((s) => s.bootContentReady)
  const setGlobalPageIndex = useReadingStore((s) => s.setGlobalPageIndex)

  const { rootStyle, contentBodyStyle } = useContentStyles()

  // ── 低频结构状态 ──
  // 弹簧动画状态（启动/落幕各一次 setState）
  const [animState, setAnimState] = useState<CoverAnimState | null>(null)
  const animStateRef = useRef<CoverAnimState | null>(null)
  animStateRef.current = animState
  // 拖拽会话（方向/相邻页，桥接回调驱动；开始/换向/结束各一次 setState）
  const [dragSession, setDragSession] = useState<CoverDragSession | null>(null)
  // 提交落幕后克隆层继续盖住新规范流，待 body 挂载 + applyMarks 后撤下（两阶段转正）
  const [settlingClone, setSettlingClone] = useState(false)
  const settlingCloneRef = useRef(false)
  settlingCloneRef.current = settlingClone

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
    // phase-12 perf: batch React state updates inside unstable_batchedUpdates
    // to avoid 3 separate renders when called from spring onComplete (rAF).
    // Preserve original order: React state first, then zustand actions.
    unstable_batchedUpdates(() => {
      setDragSession(null)
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
    })
  }, [clearClone])

  // 拖拽会话变化（桥接回调）：克隆挂载/销毁 + 打断转正遮盖收尾
  const handleDragSessionChange = useCallback(
    (session: CoverDragSession | null) => {
      setDragSession(session)
      if (session === null) {
        if (!settlingCloneRef.current) clearClone()
        return
      }
      if (settlingCloneRef.current) {
        // 新拖拽打断转正遮盖收尾：取消待执行的撤克隆，避免误删新拖拽的克隆
        setSettlingClone(false)
      }
      if (session.adjacent) showClone(session.adjacent)
      else clearClone()
    },
    [showClone, clearClone]
  )

  const bridge = useCoverMotionBridge({
    currentRootRef,
    cloneRootRef,
    onDragSessionChange: handleDragSessionChange,
    onSpringSettleInterrupted: finalizeAnim
  })
  const bridgeRef = useRef<CoverMotionBridge>(bridge)
  bridgeRef.current = bridge

  // 启动弹簧补间：fromX 起步（速度连续），目标位由 commit/direction 决定
  const startAnim = useCallback(
    (anim: CoverAnimState) => {
      const state = useReadingStore.getState()
      state.setFlipAnimating(true)
      // 复位拖拽残留位移：fromX 已捕获松手位置，补间由 animState + 弹簧驱动
      state.setDragOffset(0)
      if (anim.adjacent) showClone(anim.adjacent)
      setAnimState(anim)
      const pw = state.pageWidth
      const which: 'current' | 'clone' =
        anim.direction === 1 || !anim.adjacent ? 'current' : 'clone'
      const targetX = anim.commit
        ? getCoverCommitTargetX(anim.direction, pw)
        : anim.adjacent
          ? getCoverRestingX(anim.direction, pw)
          : 0 // 首末页阻尼回弹归位
      // 消费松手速度（px/ms）作为弹簧初速度，读取后复位
      const velocity = state.dragReleaseVelocity
      if (velocity !== 0) state.setDragReleaseVelocity(0)
      bridgeRef.current.playSpring({
        which,
        fromX: anim.fromX,
        targetX,
        velocity,
        onComplete: finalizeAnim,
        direction: anim.direction
      })
    },
    [showClone, finalizeAnim]
  )

  // useTouchFlip 覆写点：拖拽松手判定与点击分区翻页 → 覆盖动画提交/回弹
  const handleTurnPage = useCallback(
    (action: DragTurnResult, lastDx: number): boolean => {
      // 快速连滑/连点：弹簧未落幕又来新提交 → 取消弹簧并无动画落定，再处理新提交
      if (animStateRef.current) {
        bridgeRef.current.cancelSpring()
        finalizeAnim()
      }
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
    // 不拦截补间期间的新手势：快速连滑由「打断落定」接管（桥接检测 dragOffset）
    shouldBlock: () => selectionBridgeRef?.current?.shouldBlockFlip() ?? false,
    onTurnPage: handleTurnPage
  })

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

  // ── 层级与阴影派生（低频：dragSession/animState/settlingClone 驱动） ──

  const currentSurface = resolvePageSurface(globalPageIndex, buffer)
  const localPageIndex = currentSurface?.localPageIndex ?? 0

  const direction: CoverDirection = animState?.direction ?? dragSession?.direction ?? 1
  const adjacentSurface = animState ? animState.adjacent : dragSession?.adjacent ?? null
  const hasAdjacent = adjacentSurface !== null

  // next：当前页滑出（动）；prev：上一页克隆滑入（动）；无相邻页（首末页阻尼）：当前页动
  const currentIsMoving = direction === 1 || !hasAdjacent
  // 提交落幕后的转正期克隆恒在顶层遮盖（新拖拽开始会同步清 settlingClone，见会话回调）
  const settling = settlingClone && !animState
  const cloneOnTop = settling || !currentIsMoving
  const showMovingShadow = dragSession !== null || animState !== null
  // 克隆渲染与当前相邻页推导对齐：拖拽中途换向时，旧方向克隆在桥接会话回调换新前
  // 会有一帧错位（层级/位移已按新方向计算），直接不渲染该帧
  const cloneVisible =
    activeClone !== null &&
    (settling || (adjacentSurface !== null && activeClone.key === adjacentSurface.key))

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

  const registerSegmentBody = useCallback(
    (id: number, el: Element | null) => {
      if (el) segmentBodyMapRef.current.set(id, el)
      else segmentBodyMapRef.current.delete(id)
      registerBody?.(id, el)
    },
    [registerBody]
  )

  const segmentHtml = useCallback(
    (id: number): string => {
      const raw = buffer.segments[id]?.html || ''
      return wrapChapterHtmlWithNav(chapterList, id, raw)
    },
    [buffer.segments, chapterList]
  )

  // 列布局样式（对照 Vue segmentColumnStyle:350）：columnWidth 必须内联，
  // 依赖测量的 pageWidth；pageWidth=0 时不设（测量前单列兜底）。
  const flowBodyStyle = useMemo((): React.CSSProperties => {
    if (pageWidth <= 0) return contentBodyStyle
    return { ...contentBodyStyle, columnWidth: `${pageWidth}px`, columnGap: `${pageGap}px` }
  }, [contentBodyStyle, pageWidth, pageGap])

  const hiddenFlowStyle = useMemo(
    () =>
      ({
        '--page-width': `${pageWidth}px`,
        '--page-stride': `${pageStride}px`
      }) as React.CSSProperties,
    [pageWidth, pageStride]
  )

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
        {/* 邻居章隐藏测量流（visibility:hidden，供 usePagination scrollWidth 测量 + 克隆源） */}
        <div className="paged-reader__hidden-flows" aria-hidden="true">
          {buffer.order
            .filter((id) => Number(id) !== Number(chapterId))
            .map((id) => (
              <div
                key={id}
                className="paged-reader__hidden-flow"
                data-segment-id={id}
                style={hiddenFlowStyle}
              >
                <ChapterFlow
                  chapterId={id}
                  html={segmentHtml(id)}
                  blocked={isChapterBlocked(id)}
                  bodyStyle={flowBodyStyle}
                  chapterList={chapterList}
                  registerSegmentBody={registerSegmentBody}
                />
              </div>
            ))}
        </div>

        {/* 相邻页克隆层（短命）：next=底层静止 / prev=顶层滑入 / 提交落幕遮盖转正 */}
        {cloneVisible && activeClone && (
          <PageSurfaceView
            zIndex={cloneOnTop ? 2 : 1}
            moving={!currentIsMoving && showMovingShadow}
            sliceTranslateX={-activeClone.localPageIndex * pageStride}
            pageWidth={pageWidth}
            pageStride={pageStride}
            cloneHostRef={cloneHostRef}
            rootRef={cloneRootRef}
          />
        )}

        {/* 当前页容器：规范流本体（划线/批注/选区/跳转唯一作用对象） */}
        <PageSurfaceView
          zIndex={cloneOnTop ? 1 : 2}
          moving={currentIsMoving && showMovingShadow}
          sliceTranslateX={-localPageIndex * pageStride}
          pageWidth={pageWidth}
          pageStride={pageStride}
          segmentId={chapterId}
          rootRef={currentRootRef}
        >
          <ChapterFlow
            chapterId={chapterId}
            html={segmentHtml(chapterId)}
            blocked={isChapterBlocked(chapterId)}
            bodyStyle={flowBodyStyle}
            chapterList={chapterList}
            registerSegmentBody={registerSegmentBody}
          />
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

interface ChapterFlowProps {
  chapterId: number
  /** 包装后的章 HTML（经 wrapChapterHtmlWithNav，LRU 缓存引用稳定） */
  html: string
  blocked: boolean
  bodyStyle: React.CSSProperties
  chapterList: ChapterMeta[]
  registerSegmentBody: (id: number, el: Element | null) => void
}

/**
 * 章内容流（React.memo，phase-11）：规范流本体，当前页容器与隐藏测量区共用。
 * 拖拽期间父组件零 re-render；会话/动画等低频重渲染时 props 全为原始值或
 * 稳定引用。
 *
 * memoize {__html} 避免每次 re-render 创建新对象导致
 * React 重置 innerHTML 销毁已注入的 <mark> 划线元素。
 */
const ChapterFlow = memo(function ChapterFlow(props: ChapterFlowProps): React.ReactNode {
  const { chapterId, html, blocked, bodyStyle, chapterList, registerSegmentBody } = props
  const bodyRef = useCallback(
    (el: Element | null) => registerSegmentBody(chapterId, el),
    [chapterId, registerSegmentBody]
  )
  const innerHtml = useMemo(() => ({ __html: html }), [html])
  if (blocked) {
    return <ChapterBlockedBody chapterId={chapterId} chapterList={chapterList} />
  }
  if (!html) {
    return <ChapterSkeleton />
  }
  return (
    <div
      ref={bodyRef}
      className="reader-content__body reader-content__body--columns read_c"
      style={bodyStyle}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={innerHtml}
    />
  )
})

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
