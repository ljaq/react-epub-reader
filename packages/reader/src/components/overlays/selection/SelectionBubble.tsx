/**
 * 选区操作气泡 — 对照 old-vue-reader/components/SelectionBubble/index.vue
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DEFAULT_UNDERLINE_COLOR,
  isBackgroundLineColor,
  LINE_COLOR_BLUE
} from '../../../core/highlights/line'
import type { SelectionDisplayState } from '../../../store/annotation-store'
import './selection.css'

const TEXT_MENU = [
  { action: 'line' as const, label: '划线' },
  { action: 'annotate' as const, label: '批注' },
  { action: 'copy' as const, label: '复制' }
]

const LINE_MENU = [
  { action: 'erase' as const, label: '擦除' },
  { action: 'annotate' as const, label: '批注' },
  { action: 'copy' as const, label: '复制' }
]

const VIEWPORT_PADDING = 8
const ARROW_SIZE = 6
const STATUS_BAR_OFFSET = 24

export interface BubbleLayout {
  placement: 'above' | 'below'
  left: number
  top: number
  arrowLeft: number
}

export function computeBubbleLayout({
  rect = {},
  bubbleWidth = 200,
  bubbleHeight = 40,
  isLineMode = false,
  viewport = { width: window.innerWidth, height: window.innerHeight }
}: {
  rect?: Partial<{ top: number; left: number; width: number; height: number; bottom: number }>
  bubbleWidth?: number
  bubbleHeight?: number
  isLineMode?: boolean
  viewport?: { width: number; height: number }
} = {}): BubbleLayout {
  const anchorX = (rect.left || 0) + (rect.width || 0) / 2
  const rectTop = rect.top || 0
  const rectBottom = rect.bottom ?? rectTop + (rect.height || 0)
  const gap = isLineMode ? 16 : 12
  const halfW = bubbleWidth / 2
  const topInset = Math.max(VIEWPORT_PADDING, STATUS_BAR_OFFSET)
  const bottomInset = VIEWPORT_PADDING

  const spaceAbove = rectTop - topInset
  const spaceBelow = viewport.height - rectBottom - bottomInset
  const requiredHeight = bubbleHeight + gap + ARROW_SIZE

  let placement: 'above' | 'below' = 'above'
  let top = rectTop - bubbleHeight - gap - ARROW_SIZE

  if (spaceAbove >= requiredHeight) {
    placement = 'above'
    top = rectTop - bubbleHeight - gap - ARROW_SIZE
  } else if (spaceBelow >= requiredHeight) {
    placement = 'below'
    top = rectBottom + gap + ARROW_SIZE
  } else if (spaceAbove >= spaceBelow) {
    placement = 'above'
    top = Math.max(topInset, rectTop - bubbleHeight - gap - ARROW_SIZE)
  } else {
    placement = 'below'
    top = Math.min(viewport.height - bubbleHeight - bottomInset, rectBottom + gap + ARROW_SIZE)
  }

  top = Math.max(topInset, Math.min(top, viewport.height - bubbleHeight - bottomInset))

  let bubbleCenterX = anchorX
  bubbleCenterX = Math.min(
    Math.max(bubbleCenterX, halfW + VIEWPORT_PADDING),
    viewport.width - halfW - VIEWPORT_PADDING
  )

  const bubbleLeft = bubbleCenterX - halfW
  const arrowLeft = Math.min(Math.max(anchorX - bubbleLeft, 12), bubbleWidth - 12)

  return { placement, left: bubbleCenterX, top, arrowLeft }
}

export interface SelectionBubbleActionPayload {
  action: 'line' | 'line-color' | 'erase' | 'copy' | 'annotate'
  selection: SelectionDisplayState
  color?: string
}

export interface SelectionBubbleProps {
  selection: SelectionDisplayState
  onAction: (payload: SelectionBubbleActionPayload) => void
}

export function SelectionBubble(props: SelectionBubbleProps): React.ReactNode {
  const { selection, onAction } = props
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [bubbleWidth, setBubbleWidth] = useState(200)
  const [bubbleHeight, setBubbleHeight] = useState(40)
  const [menuOffsetLeft, setMenuOffsetLeft] = useState(0)
  const [menuWidth, setMenuWidth] = useState(0)

  const isLineMode = selection.mode === 'line'
  const menuItems = isLineMode ? LINE_MENU : TEXT_MENU
  const activeLineColor = selection.underlineColor || DEFAULT_UNDERLINE_COLOR
  const isYellowActive = isBackgroundLineColor(activeLineColor)
  const isBlueActive = !isBackgroundLineColor(activeLineColor)

  const measureBubbleSize = useCallback(() => {
    const bubble = bubbleRef.current
    if (!bubble) return
    const width = bubble.offsetWidth || 200
    const height = bubble.offsetHeight || 40
    const menu = menuRef.current
    const nextMenuOffsetLeft = menu ? menu.offsetLeft : 0
    const nextMenuWidth = menu ? menu.offsetWidth : width

    // 对齐 Vue measureBubbleSize：仅尺寸变化时才 setState，避免 layout ↔ measure 死循环
    setBubbleWidth((prev) => (prev === width ? prev : width))
    setBubbleHeight((prev) => (prev === height ? prev : height))
    setMenuOffsetLeft((prev) => (prev === nextMenuOffsetLeft ? prev : nextMenuOffsetLeft))
    setMenuWidth((prev) => (prev === nextMenuWidth ? prev : nextMenuWidth))
  }, [])

  const selectionLayoutKey = [
    isLineMode,
    selection.rect?.top ?? 0,
    selection.rect?.left ?? 0,
    selection.rect?.width ?? 0,
    selection.rect?.height ?? 0,
    selection.webLineId ?? ''
  ].join(':')

  useLayoutEffect(() => {
    measureBubbleSize()
  }, [measureBubbleSize, selectionLayoutKey])

  useEffect(() => {
    window.addEventListener('resize', measureBubbleSize)
    window.addEventListener('scroll', measureBubbleSize, true)
    return () => {
      window.removeEventListener('resize', measureBubbleSize)
      window.removeEventListener('scroll', measureBubbleSize, true)
    }
  }, [measureBubbleSize])

  const bubbleLayout = computeBubbleLayout({
    rect: selection.rect || {},
    bubbleWidth,
    bubbleHeight,
    isLineMode
  })

  const resolvedMenuWidth = menuWidth || bubbleWidth
  const arrowLeft = Math.min(
    Math.max(bubbleLayout.arrowLeft - menuOffsetLeft, 12),
    resolvedMenuWidth - 12
  )

  const handleAction = (action: SelectionBubbleActionPayload['action']) => {
    onAction({ action, selection })
  }

  const handleColorClick = (color: string) => {
    if (color === activeLineColor) return
    onAction({ action: 'line-color', selection, color })
  }

  return (
    <div
      ref={bubbleRef}
      className={`selection-bubble selection-bubble--${bubbleLayout.placement}`}
      style={{ left: `${bubbleLayout.left}px`, top: `${bubbleLayout.top}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {isLineMode ? (
        <div
          className={`selection-bubble__line-content${
            bubbleLayout.placement === 'below' ? ' selection-bubble__line-content--below' : ''
          }`}
        >
          <div className="selection-bubble__colors-row" aria-label="划线颜色">
            <button
              type="button"
              className={`selection-bubble__color-btn selection-bubble__color-btn--yellow${
                isYellowActive ? ' selection-bubble__color-btn--active' : ''
              }`}
              aria-label="黄色背景"
              onClick={() => handleColorClick(DEFAULT_UNDERLINE_COLOR)}
            >
              <span className="selection-bubble__color-a selection-bubble__color-a--yellow">A</span>
            </button>
            <button
              type="button"
              className={`selection-bubble__color-btn selection-bubble__color-btn--blue${
                isBlueActive ? ' selection-bubble__color-btn--active' : ''
              }`}
              aria-label="蓝色下划线"
              onClick={() => handleColorClick(LINE_COLOR_BLUE)}
            >
              <span className="selection-bubble__color-a selection-bubble__color-a--blue">A</span>
            </button>
          </div>
          <div ref={menuRef} className="selection-bubble__menu" style={{ ['--arrow-left' as string]: `${arrowLeft}px` }}>
            {menuItems.map((item) => (
              <button
                key={item.action}
                type="button"
                className="selection-bubble__item"
                onClick={() => handleAction(item.action)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={menuRef} className="selection-bubble__menu" style={{ ['--arrow-left' as string]: `${arrowLeft}px` }}>
          {menuItems.map((item) => (
            <button
              key={item.action}
              type="button"
              className="selection-bubble__item"
              onClick={() => handleAction(item.action)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
