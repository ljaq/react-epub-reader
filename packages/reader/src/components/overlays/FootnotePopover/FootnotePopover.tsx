/**
 * 脚注 Popover — 1:1 对照 Vue FootnotePopover/index.vue
 */
import { useUiStore } from '../../../store/ui-store'
import './footnote-popover.css'

const HORIZONTAL_MARGIN = 20
const GAP_ABOVE_ANCHOR = 10

export function FootnotePopover(): React.ReactNode {
  const visible = useUiStore((s) => s.footnote.visible)
  const text = useUiStore((s) => s.footnote.text)
  const anchorRect = useUiStore((s) => s.footnote.anchorRect)

  if (!visible) return null

  const popoverStyle: React.CSSProperties = (() => {
    const rect = anchorRect
    if (!rect) {
      return {
        left: `${HORIZONTAL_MARGIN}px`,
        right: `${HORIZONTAL_MARGIN}px`,
        bottom: '30px'
      }
    }
    const bottom = Math.max(30, window.innerHeight - rect.top + GAP_ABOVE_ANCHOR)
    return {
      left: `${HORIZONTAL_MARGIN}px`,
      right: `${HORIZONTAL_MARGIN}px`,
      bottom: `${bottom}px`
    }
  })()

  const arrowStyle: React.CSSProperties = (() => {
    const rect = anchorRect
    if (!rect) {
      return { left: '0px' }
    }
    const popoverLeft = HORIZONTAL_MARGIN
    const anchorCenter = rect.left + rect.width / 2
    const arrowLeft = anchorCenter - popoverLeft - 6
    return {
      left: `${Math.max(0, arrowLeft)}px`
    }
  })()

  return (
    <div className="reader-footnote" style={popoverStyle}>
      <div className="reader-footnote__arr" style={arrowStyle} />
      <span className="reader-footnote__text">{text}</span>
    </div>
  )
}
