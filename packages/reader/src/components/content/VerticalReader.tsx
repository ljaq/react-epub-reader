/**
 * 竖滚阅读器 — 单章滚动 + 章首/章末导航按钮。
 *
 * 源码对照：old-vue-reader/components/ReaderContent/index.vue 竖滚分支（template:45-71）。
 *
 * - 竖滚单章，章内滚动，竖滑不切章（touch-action: pan-y）。
 * - 章首 pill「上一章」左对齐 + 章末通栏「下一章」（对照 index.vue:2554-2585）。
 * - 章末按钮依据 ChapterContent.hasNext 显隐/置灰。
 * - 章节加载态：chapterLoadStates[id]='loading' 骨架 / 'error' 触发 onError。
 */
import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type {
  ChapterContent,
  ChapterLoadState,
  ChapterMeta
} from '../../types'
import { getAdjacentChapterId } from '../../core/chapter-buffer'
import { getChapterNavFlags, wrapChapterHtmlWithNav } from '../../core/chapter-nav'
import { useReadingStore } from '../../store/reading-store'
import { useUiStore } from '../../store/ui-store'
import { useContentStyles } from '../../hooks/useContentStyles'
import { useContentRichMedia } from '../../hooks/useContentRichMedia'
import type { SelectionBridgeHandle } from '../overlays/selection/SelectionLayer'
import './reader-content.css'

export interface VerticalReaderProps {
  chapterList: ChapterMeta[]
  chapters: Record<number, ChapterContent>
  chapterLoadStates: Record<number, ChapterLoadState>
  isChapterBlocked: (chapterId: number) => boolean
  onChapterChange?: (chapterId: number, width: number) => void
  onError?: (payload: { scope: string; message: string }) => void
  selectionBridgeRef?: RefObject<SelectionBridgeHandle | null>
  registerBody?: (chapterId: number, el: Element | null) => void
  registerScrollRoot?: (el: HTMLElement | null) => void
  noteBadgesRef?: RefObject<HTMLDivElement | null>
  inlineLoginTip?: React.ReactNode
  onLinkClick?: (href: string) => void
}

export function VerticalReader(props: VerticalReaderProps): React.ReactNode {
  const {
    chapterList,
    chapters,
    chapterLoadStates,
    isChapterBlocked,
    onChapterChange,
    onError,
    selectionBridgeRef,
    registerBody,
    registerScrollRoot,
    noteBadgesRef,
    inlineLoginTip,
    onLinkClick
  } = props

  const rootRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const chapterId = useReadingStore((s) => s.chapterId)
  const setChapterId = useReadingStore((s) => s.setChapterId)
  const resetReadingPosition = useReadingStore((s) => s.resetReadingPosition)
  const setNeighborPreloadStarted = useReadingStore((s) => s.setNeighborPreloadStarted)
  const toggleUi = useUiStore((s) => s.toggleUi)
  const { handleRichMediaTap, hideFootnoteOnTouchMove } = useContentRichMedia({ onLinkClick })

  const { rootStyle, contentBodyStyle } = useContentStyles()

  const current = chapters[chapterId]
  const loadState = chapterLoadStates[chapterId]
  const blocked = isChapterBlocked(chapterId)
  const flags = getChapterNavFlags(chapterList, chapterId)
  const hasNext = Boolean(current?.hasNext)

  const displayHtml = current ? wrapChapterHtmlWithNav(chapterList, chapterId, current.html) : ''

  // 切章：竖滚单章，调 onChapterChange 请求宿主 fetch；宿主更新 chapters prop 后重新渲染
  const goToChapter = useCallback(
    (direction: 1 | -1) => {
      const nextId = getAdjacentChapterId(chapterList, chapterId, direction)
      if (!nextId) return
      if (direction > 0 && isChapterBlocked(nextId)) return
      setChapterId(nextId)
      setNeighborPreloadStarted(false)
      resetReadingPosition()
      // 请求宿主 fetch 该章（width=0 竖滚不测量）
      onChapterChange?.(nextId, 0)
    },
    [
      chapterList,
      chapterId,
      isChapterBlocked,
      setChapterId,
      setNeighborPreloadStarted,
      resetReadingPosition,
      onChapterChange
    ]
  )

  // 章节切换后滚到顶部（对照 Vue resetToChapterStart:1059）
  useEffect(() => {
    const root = rootRef.current
    if (root) root.scrollTop = 0
  }, [chapterId])

  // 竖滚无分页测量；内容就绪即标记首屏 settled，供 initialPosition restore
  useEffect(() => {
    if (blocked) return
    if (loadState === 'loading' || !current?.html) return
    const settled = useReadingStore.getState().initialLayoutSettled
    if (!settled) {
      useReadingStore.getState().markInitialLayoutSettled()
    }
  }, [blocked, loadState, current?.html, chapterId])

  // error → onError
  useEffect(() => {
    if (loadState === 'error') {
      onError?.({ scope: 'chapter', message: `章节 ${chapterId} 加载失败` })
    }
  }, [loadState, chapterId, onError])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const bridge = selectionBridgeRef?.current
      const target = e.target as HTMLElement

      // 划线/批注角标优先响应，避免被 longPressActivated / 选区 dismiss 拦截（对齐 Vue 首次点击即出气泡）
      const noteBadge = target.closest('.reader-note-badge')
      if (noteBadge && bridge) {
        bridge.handleNoteBadgeClick(e, noteBadge as HTMLElement)
        return
      }

      const lineMark = target.closest('.reader-line-mark')
      if (lineMark && bridge) {
        e.stopPropagation()
        e.preventDefault()
        bridge.handleLineMarkClick(lineMark as HTMLElement, chapterId)
        return
      }

      if (bridge?.shouldIgnoreTap(e)) return

      if (handleRichMediaTap(e)) return

      const clickTarget = e.currentTarget as HTMLElement
      const rect = clickTarget.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = (e.clientX - rect.left) / rect.width
      if (ratio >= 0.2 && ratio <= 0.8) {
        toggleUi()
      }
    },
    [selectionBridgeRef, chapterId, toggleUi, handleRichMediaTap]
  )

  return (
    <div
      ref={(el) => {
        rootRef.current = el
        registerScrollRoot?.(el)
      }}
      className={`reader-content reader-content--vertical${loadState === 'loading' ? ' reader-content--chapter-loading' : ''}`}
      style={rootStyle}
      onClick={handleClick}
      onTouchMove={hideFootnoteOnTouchMove}
    >
      <div className="reader-content__viewport-v">
        <div className="reader-content__vertical-wrap">
          {flags.hasPrev && (
            <div className="reader-chapter-btn-slot reader-chapter-btn-slot--prev">
              <button
                type="button"
                className="reader-chapter-btn reader-chapter-btn--prev"
                data-chapter-nav="prev"
                onClick={(e) => {
                  e.stopPropagation()
                  goToChapter(-1)
                }}
              >
                上一章
              </button>
            </div>
          )}

          {blocked ? (
            <ChapterBlockedBody chapterId={chapterId} chapterList={chapterList} />
          ) : loadState === 'loading' || !current ? (
            <ChapterSkeleton />
          ) : (
            <div
              ref={(el) => {
                bodyRef.current = el
                registerBody?.(chapterId, el)
              }}
              className="reader-content__body read_c"
              style={contentBodyStyle}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          )}

          <div
            ref={noteBadgesRef}
            className="reader-content__note-badges reader-content__note-badges--scroll"
          />

          <div className="reader-chapter-btn-slot reader-chapter-btn-slot--next">
            <button
              type="button"
              className="reader-chapter-btn reader-chapter-btn--next"
              data-chapter-nav="next"
              disabled={!hasNext}
              onClick={(e) => {
                e.stopPropagation()
                if (hasNext) goToChapter(1)
              }}
            >
              下一章
            </button>
          </div>

          {inlineLoginTip}
        </div>
      </div>

      {(loadState === 'loading' || !current) && (
        <div className="reader-content__chapter-loading" aria-busy="true" aria-live="polite">
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
