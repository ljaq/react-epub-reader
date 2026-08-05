/**
 * 平移模式阅读器（flipMode='slide'）— 多章缓冲池 + 连续 transform track。
 *
 * phase-10 语义正名：本组件即「平移」翻页模式（整轨横滑）；
 * 「覆盖」翻页见 paged/PagedReader。
 *
 * 源码对照：old-vue-reader/components/ReaderContent/index.vue 横划分支（template:12-42）。
 *
 * - track transform 由 useSlideMotionBridge 命令式独占写入（phase-11）：
 *   拖拽跟手走 vanilla subscribe + rAF 合帧直写，本组件不订阅 dragOffset，
 *   拖拽期间零 re-render；提交/回弹由桥接弹簧动画驱动（速度连续、可打断）。
 * - 动画抑制（boot/rebalancing/layoutLocked/loading/silentExpand）由桥接直写终值
 *   （对照 shouldSuppressTrackTransition:324）。
 * - 章首/章末导航按钮：横划模式在 buffer 边界页渲染（对照 phase-02 任务 2 +
 *   Vue handlePrevChapter/handleNextChapter:1374-1408）。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ChapterContent, ChapterMeta } from '../../types'
import type { SelectionBridgeHandle } from '../overlays/selection/SelectionLayer'
import {
  getAdjacentChapterId,
  getLastChapterPageGlobal,
  localToGlobal
} from '../../core/chapter-buffer'
import { getChapterNavFlags, wrapChapterHtmlWithNav } from '../../core/chapter-nav'
import { useReadingStore } from '../../store/reading-store'
import { useTouchFlip } from '../../hooks/useTouchFlip'
import { usePagination } from '../../hooks/usePagination'
import { useContentStyles } from '../../hooks/useContentStyles'
import { useTrialEndTip } from '../../hooks/useTrialEndTip'
import { useContentRichMedia } from '../../hooks/useContentRichMedia'
import { useSlideMotionBridge } from '../../hooks/useSlideMotionBridge'
import { BOOT_LOADING_FADE_MS } from '../../hooks/useNavigateToNavTarget'
import './reader-content.css'

export interface HorizontalReaderProps {
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

export function HorizontalReader(props: HorizontalReaderProps): React.ReactNode {
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
  const trackRef = useRef<HTMLDivElement | null>(null)
  const segmentBodyMapRef = useRef<Map<number, Element>>(new Map())

  const globalPageIndex = useReadingStore((s) => s.globalPageIndex)
  const buffer = useReadingStore((s) => s.buffer)
  const pageStride = useReadingStore((s) => s.pageStride)
  const pageWidth = useReadingStore((s) => s.pageWidth)
  const pageGap = useReadingStore((s) => s.pageGap)
  const isFlipping = useReadingStore((s) => s.isFlipping)
  const chapterId = useReadingStore((s) => s.chapterId)
  const pageCount = useReadingStore((s) => s.pageCount)
  const bootContentReady = useReadingStore((s) => s.bootContentReady)
  const setGlobalPageIndex = useReadingStore((s) => s.setGlobalPageIndex)

  const { rootStyle, contentBodyStyle } = useContentStyles()

  // 首屏遮罩镜像 ref：桥接抑制条件需要读取最新值（本地 state，不经 store）
  const bootOverlayVisibleRef = useRef(true)

  const { requestSync } = useSlideMotionBridge({
    trackRef,
    isSuppressedExtra: () => bootOverlayVisibleRef.current
  })

  const getSegmentBody = useCallback((id: number): Element | null => {
    return segmentBodyMapRef.current.get(Number(id)) ?? null
  }, [])

  const { runInitialLayout, getFetchWidth } = usePagination({
    enabled: true,
    viewportRef,
    getSegmentBody,
    isChapterBlocked
  })

  const { handlers: dragHandlers, onClick } = useTouchFlip({
    enabled: true,
    shouldBlock: () => selectionBridgeRef?.current?.shouldBlockFlip() ?? false
  })

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

  // 首屏 / 淡出期间由桥接抑制动画（邻居章 silentExpand 重定位不得露出动画）
  const [bootOverlayVisible, setBootOverlayVisible] = useState(true)
  const [bootOverlayLeaving, setBootOverlayLeaving] = useState(false)
  bootOverlayVisibleRef.current = bootOverlayVisible

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
    if (!bootOverlayLeaving) return
    const timer = window.setTimeout(() => setBootOverlayVisible(false), BOOT_LOADING_FADE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [bootOverlayLeaving])

  // 遮罩揭开 → 通知桥接重算（抑制解除，直写/弹簧语义由桥接判定）
  useEffect(() => {
    requestSync()
  }, [bootOverlayVisible, requestSync])

  const segmentHtml = useCallback(
    (id: number): string => {
      const raw = buffer.segments[id]?.html || ''
      return wrapChapterHtmlWithNav(chapterList, id, raw)
    },
    [buffer.segments, chapterList]
  )

  const flags = getChapterNavFlags(chapterList, chapterId)
  const goToAdjacentChapter = useCallback(
    (direction: 1 | -1) => {
      const nextId = getAdjacentChapterId(chapterList, chapterId, direction)
      if (!nextId) return
      const state = useReadingStore.getState()
      const segment = state.buffer.segments[nextId]
      if (segment) {
        const pageIndex = direction > 0 ? 0 : Math.max(0, (segment.pageCount || 1) - 1)
        setGlobalPageIndex(localToGlobal(nextId, pageIndex, state.buffer))
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
      className={`reader-content reader-content--horizontal${bootOverlayVisible ? ' reader-content--chapter-loading' : ''}`}
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
      >
        <div className="reader-content__track" ref={trackRef} {...dragHandlers}>
          {buffer.order.map((id, idx) => (
            <SegmentView
              key={id}
              segmentId={id}
              html={segmentHtml(id)}
              blocked={isChapterBlocked(id)}
              isFlipping={isFlipping}
              widthPx={buffer.segments[id]?.widthPx ?? 0}
              isLast={idx === buffer.order.length - 1}
              pageWidth={pageWidth}
              pageStride={pageStride}
              pageGap={pageGap}
              contentBodyStyle={contentBodyStyle}
              chapterList={chapterList}
              registerSegmentBody={registerSegmentBody}
            />
          ))}
        </div>

        {atBookStart && flags.hasPrev && (
          <div
            className="reader-chapter-btn-slot reader-chapter-btn-slot--prev"
            style={{ position: 'absolute', left: 0, top: 8 }}
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
          style={{ position: 'absolute', right: 0, bottom: 12 }}
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

interface SegmentViewProps {
  segmentId: number
  /** 包装后的章 HTML（经 wrapChapterHtmlWithNav，LRU 缓存引用稳定） */
  html: string
  blocked: boolean
  isFlipping: boolean
  widthPx: number
  isLast: boolean
  pageWidth: number
  pageStride: number
  pageGap: number
  contentBodyStyle: React.CSSProperties
  chapterList: ChapterMeta[]
  registerSegmentBody: (id: number, el: Element | null) => void
}

/**
 * 单章 segment（React.memo，phase-11）：拖拽期间父组件零 re-render，
 * buffer patch / isFlipping 切换等低频渲染时 props 全为原始值或稳定引用，
 * 命中缓存的 html 使 dangerouslySetInnerHTML diff O(1) 短路。
 */
const SegmentView = memo(function SegmentView(props: SegmentViewProps): React.ReactNode {
  const {
    segmentId,
    html,
    blocked,
    isFlipping,
    widthPx,
    isLast,
    pageWidth,
    pageStride,
    pageGap,
    contentBodyStyle,
    chapterList,
    registerSegmentBody
  } = props

  const segmentStyle = useMemo((): React.CSSProperties => {
    const cssVars = {
      '--page-width': `${pageWidth}px`,
      '--page-stride': `${pageStride}px`
    } as React.CSSProperties
    if (widthPx > 0) {
      const style: React.CSSProperties = { ...cssVars, width: `${widthPx}px`, flexShrink: 0 }
      if (!isLast) style.marginRight = `${pageGap}px`
      return style
    }
    return { ...cssVars, minWidth: `${pageStride || 0}px`, flexShrink: 0 }
  }, [widthPx, isLast, pageWidth, pageStride, pageGap])

  // 列布局样式（对照 Vue segmentColumnStyle:350）：columnWidth 必须内联，
  // 依赖测量的 pageWidth；pageWidth=0 时不设（测量前单列兜底）。
  const bodyStyle = useMemo((): React.CSSProperties => {
    if (pageWidth <= 0) return contentBodyStyle
    return { ...contentBodyStyle, columnWidth: `${pageWidth}px`, columnGap: `${pageGap}px` }
  }, [contentBodyStyle, pageWidth, pageGap])

  // memoize {__html} 避免每次 re-render 创建新对象导致
  // React 重置 innerHTML 销毁已注入的 <mark> 划线元素
  const innerHtml = useMemo(() => ({ __html: html }), [html])

  const bodyRef = useCallback(
    (el: Element | null) => registerSegmentBody(segmentId, el),
    [segmentId, registerSegmentBody]
  )

  return (
    <div
      className={`reader-content__segment${isFlipping ? ' is-flipping' : ''}`}
      data-segment-id={segmentId}
      style={segmentStyle}
    >
      {blocked ? (
        <ChapterBlockedBody chapterId={segmentId} chapterList={chapterList} />
      ) : html ? (
        <div
          ref={bodyRef}
          className="reader-content__body reader-content__body--columns read_c"
          style={bodyStyle}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={innerHtml}
        />
      ) : (
        <ChapterSkeleton />
      )}
    </div>
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
