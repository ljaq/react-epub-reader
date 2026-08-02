/**
 * 章节进度条 — 源码对照 old-vue-reader/components/ReaderChrome/ChapterProgress/index.vue。
 *
 * 拖动/点击切章 + 左右切章按钮。命中付费/未登录章 → onLoginRequired + 复位滑块。
 * 不展示章序文案（以设计图 唤起工具栏.png 为准）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChapterAccess, ChapterMeta } from '../../types'
import { findChapterIndex } from '../../core/chapter-buffer'
import { useUiStore } from '../../store/ui-store'
import { navigateToChapter } from './navigation'

const THUMB_SIZE = 30

export interface ChapterProgressProps {
  visible: boolean
  bookId: number
  chapterId: number
  isLoggedIn: boolean
  chapterList: ChapterMeta[]
  chapterAccess: Record<number, ChapterAccess>
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
}

function getClientX(event: MouseEvent | TouchEvent): number | null {
  const me = event as MouseEvent
  if (typeof me.clientX === 'number') return me.clientX
  const te = event as TouchEvent
  const touch = te.touches?.[0]
  if (touch && typeof touch.clientX === 'number') return touch.clientX
  const changed = te.changedTouches?.[0]
  if (changed && typeof changed.clientX === 'number') return changed.clientX
  return null
}

export function ChapterProgress(props: ChapterProgressProps): React.ReactNode {
  const { visible, bookId, chapterId, isLoggedIn, chapterList, chapterAccess, onLoginRequired } = props
  void bookId
  void isLoggedIn

  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLButtonElement | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const [thumbWidth, setThumbWidth] = useState(THUMB_SIZE)
  const [dragging, setDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)

  const popups = useUiStore((s) => s.popups)

  const currentIndex = Math.max(0, findChapterIndex(chapterList, chapterId))
  const maxIndex = Math.max(0, chapterList.length - 1)

  const activeIndex =
    dragging && dragIndex !== null
      ? dragIndex
      : pendingIndex !== null
        ? pendingIndex
        : currentIndex

  const canPrev = currentIndex > 0
  const canNext = currentIndex >= 0 && currentIndex < chapterList.length - 1

  const thumbLeft = (() => {
    const travel = trackWidth - thumbWidth
    if (travel <= 0 || !chapterList.length) return thumbWidth / 2
    if (maxIndex === 0) return thumbWidth / 2
    return (activeIndex / maxIndex) * travel + thumbWidth / 2
  })()
  const activeBarWidth = thumbLeft + thumbWidth / 2

  const measure = useCallback(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (track) setTrackWidth(track.getBoundingClientRect().width)
    if (thumb) setThumbWidth(thumb.getBoundingClientRect().width || THUMB_SIZE)
  }, [])

  const scheduleMeasure = useCallback(() => {
    // 对齐 Vue scheduleMeasure：nextTick + rAF + 300ms 兜底
    requestAnimationFrame(() => measure())
    const t = window.setTimeout(measure, 300)
    return () => window.clearTimeout(t)
  }, [measure])

  useEffect(() => {
    if (visible) {
      measure()
      const cancel = scheduleMeasure()
      return cancel
    }
    return undefined
  }, [visible, measure, scheduleMeasure])

  useEffect(() => {
    measure()
  }, [chapterId, chapterList.length, measure])

  // pendingIndex 在 currentIndex 追上后清空
  useEffect(() => {
    if (pendingIndex !== null && currentIndex === pendingIndex) {
      setPendingIndex(null)
    }
  }, [currentIndex, pendingIndex])

  const resetSliderPosition = useCallback(() => {
    setPendingIndex(null)
    setDragIndex(null)
  }, [])

  const indexFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current
      if (!track || trackWidth <= 0 || !chapterList.length) return currentIndex
      const rect = track.getBoundingClientRect()
      const x = clientX - rect.left
      if (Number.isNaN(x)) return currentIndex
      const travel = trackWidth - thumbWidth
      if (travel <= 0 || maxIndex === 0) return 0
      const progress = (x - thumbWidth / 2) / travel
      const ratio = Math.min(1, Math.max(0, progress))
      if (ratio >= (maxIndex - 0.5) / maxIndex) return maxIndex
      return Math.min(maxIndex, Math.max(0, Math.round(ratio * maxIndex)))
    },
    [chapterList.length, currentIndex, maxIndex, thumbWidth, trackWidth]
  )

  const goToIndex = useCallback(
    (index: number) => {
      if (index === currentIndex) {
        resetSliderPosition()
        return
      }
      if (popups.catalog || popups.notes || popups.tts) {
        resetSliderPosition()
        return
      }
      const chapter = chapterList[index]
      if (!chapter) return
      setPendingIndex(index)
      const acc = chapterAccess[Number(chapter.id)]
      if (acc) {
        if (acc.needLogin) {
          onLoginRequired?.('auth')
          resetSliderPosition()
          return
        }
        if (acc.needPurchase) {
          onLoginRequired?.('paid')
          resetSliderPosition()
          return
        }
      }
      navigateToChapter(chapter.id)
    },
    [chapterAccess, chapterList, currentIndex, onLoginRequired, popups, resetSliderPosition]
  )

  const handlePrev = () => {
    if (!canPrev) return
    navigateToChapter(chapterList[currentIndex - 1].id)
  }

  const handleNext = () => {
    if (!canNext) return
    goToIndex(currentIndex + 1)
  }

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging || !chapterList.length) return
    const clientX = getClientX(e.nativeEvent)
    if (clientX === null) return
    goToIndex(indexFromClientX(clientX))
  }

  const onThumbDown = (e: React.SyntheticEvent) => {
    if (!chapterList.length) return
    e.preventDefault()
    setDragging(true)
    const base = pendingIndex !== null ? pendingIndex : currentIndex
    setDragIndex(base)
    dragIndexRef.current = base
    measure()
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = getClientX(e)
      if (clientX === null) return
      if (e.cancelable) e.preventDefault()
      const next = indexFromClientX(clientX)
      setDragIndex(next)
      dragIndexRef.current = next
    }
    const onEnd = () => {
      const target = dragIndexRef.current
      setDragging(false)
      setDragIndex(null)
      dragIndexRef.current = null
      if (target !== null && target !== currentIndex) {
        goToIndex(target)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, indexFromClientX, currentIndex, goToIndex])

  return (
    <div className={`reader-chapter-progress${visible ? ' reader-chapter-progress--visible' : ''}`}>
      <button type="button" className="reader-chapter-progress__nav" disabled={!canPrev} onClick={handlePrev}>
        上一章
      </button>
      <div
        className={`reader-chapter-progress__slider-wrap${dragging ? ' reader-chapter-progress__slider-wrap--dragging' : ''}`}
      >
        <div ref={trackRef} className="reader-chapter-progress__track" onClick={onTrackClick}>
          <div className="reader-chapter-progress__track-active" style={{ width: activeBarWidth + 'px' }} />
          <button
            ref={thumbRef}
            type="button"
            className="reader-chapter-progress__thumb"
            style={{ left: thumbLeft + 'px' }}
            aria-label="章节进度"
            onMouseDown={onThumbDown}
            onTouchStart={onThumbDown}
          />
        </div>
      </div>
      <button type="button" className="reader-chapter-progress__nav" disabled={!canNext} onClick={handleNext}>
        下一章
      </button>
    </div>
  )
}
