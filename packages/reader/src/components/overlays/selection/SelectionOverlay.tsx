/**
 * 选区高亮浮层 — 对照 old-vue-reader/components/SelectionOverlay/index.vue
 */
import type { HighlightPosItem } from '../../../core/selection/text-pos'
import './selection.css'

export interface SelectionOverlayProps {
  rects: HighlightPosItem[]
}

export function SelectionOverlay(props: SelectionOverlayProps): React.ReactNode {
  const { rects } = props
  if (!rects.length) {
    return null
  }

  return (
    <svg className="selection-overlay" aria-hidden="true">
      {rects.map((item, index) => (
        <rect
          key={index}
          className="selection-overlay__rect"
          x={item.left}
          y={item.top}
          width={Math.max(item.right - item.left, 1)}
          height={Math.max(item.bottom - item.top, 1)}
        />
      ))}
    </svg>
  )
}
