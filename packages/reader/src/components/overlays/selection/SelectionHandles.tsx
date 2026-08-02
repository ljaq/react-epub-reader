/**
 * 选区边界拖拽手柄 — 对照 old-vue-reader/components/SelectionHandles/index.vue
 */
import { useCallback, useEffect, useRef } from 'react'
import type { HandleRect } from '../../../core/selection/text-pos-rects'
import type { SelectionBoundary } from '../../../store/annotation-store'
import './selection.css'

export interface SelectionHandlesProps {
  boundary1: SelectionBoundary | HandleRect | null
  boundary2: SelectionBoundary | HandleRect | null
  needUp?: boolean
  onBoundaryDragStart: (handle: 'start' | 'end') => void
  onBoundaryDragMove: (payload: { handle: 'start' | 'end'; clientX: number; clientY: number }) => void
  onBoundaryDragEnd: (handle: 'start' | 'end') => void
}

function buildHandleStyle(boundary: SelectionBoundary | HandleRect | null): React.CSSProperties {
  if (!boundary) {
    return { display: 'none' }
  }

  const x = 'x' in boundary ? boundary.x : boundary.left
  const y = 'y' in boundary ? boundary.y : boundary.top
  const height = ('h' in boundary && boundary.h) || ('height' in boundary && boundary.height) || 18

  return {
    left: `${x}px`,
    top: `${y}px`,
    height: `${height}px`
  }
}

export function SelectionHandles(props: SelectionHandlesProps): React.ReactNode {
  const {
    boundary1,
    boundary2,
    needUp = false,
    onBoundaryDragStart,
    onBoundaryDragMove,
    onBoundaryDragEnd
  } = props

  const activeHandleRef = useRef<'start' | 'end' | null>(null)
  const boundMoveRef = useRef<(e: TouchEvent | MouseEvent) => void>(() => {})
  const boundEndRef = useRef<() => void>(() => {})

  const getClientPoint = useCallback((event: TouchEvent | MouseEvent) => {
    if ('touches' in event && event.touches[0]) {
      return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY }
    }
    const mouse = event as MouseEvent
    return { clientX: mouse.clientX, clientY: mouse.clientY }
  }, [])

  const teardownDragListeners = useCallback(() => {
    window.removeEventListener('touchmove', boundMoveRef.current, true)
    window.removeEventListener('mousemove', boundMoveRef.current, true)
    window.removeEventListener('touchend', boundEndRef.current, true)
    window.removeEventListener('touchcancel', boundEndRef.current, true)
    window.removeEventListener('mouseup', boundEndRef.current, true)
  }, [])

  const onDragEnd = useCallback(() => {
    const handle = activeHandleRef.current
    if (!handle) return
    activeHandleRef.current = null
    teardownDragListeners()
    onBoundaryDragEnd(handle)
  }, [onBoundaryDragEnd, teardownDragListeners])

  const onDragMove = useCallback(
    (event: TouchEvent | MouseEvent) => {
      const handle = activeHandleRef.current
      if (!handle) return
      event.preventDefault()
      event.stopPropagation()
      const point = getClientPoint(event)
      onBoundaryDragMove({ handle, clientX: point.clientX, clientY: point.clientY })
    },
    [getClientPoint, onBoundaryDragMove]
  )

  useEffect(() => {
    boundMoveRef.current = onDragMove
    boundEndRef.current = onDragEnd
  }, [onDragMove, onDragEnd])

  useEffect(() => () => teardownDragListeners(), [teardownDragListeners])

  const handlePointerDown = useCallback(
    (handle: 'start' | 'end') => (event: React.PointerEvent) => {
      event.stopPropagation()
      event.preventDefault()
      activeHandleRef.current = handle
      onBoundaryDragStart(handle)
      window.addEventListener('touchmove', boundMoveRef.current, { passive: false, capture: true })
      window.addEventListener('mousemove', boundMoveRef.current, true)
      window.addEventListener('touchend', boundEndRef.current, true)
      window.addEventListener('touchcancel', boundEndRef.current, true)
      window.addEventListener('mouseup', boundEndRef.current, true)
      const point = getClientPoint(event.nativeEvent)
      onBoundaryDragMove({ handle, clientX: point.clientX, clientY: point.clientY })
    },
    [getClientPoint, onBoundaryDragMove, onBoundaryDragStart]
  )

  return (
    <div className={`selection-handles${needUp ? ' selection-handles--up' : ''}`}>
      <div
        className="selection-handle selection-handle--start"
        style={buildHandleStyle(boundary1)}
        onPointerDown={handlePointerDown('start')}
      >
        <span className="selection-handle__bar" />
        <span className="selection-handle__dot" />
      </div>
      <div
        className="selection-handle selection-handle--end"
        style={buildHandleStyle(boundary2)}
        onPointerDown={handlePointerDown('end')}
      >
        <span className="selection-handle__bar" />
        <span className="selection-handle__dot" />
      </div>
    </div>
  )
}
