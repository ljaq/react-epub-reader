/**
 * 批注列表弹层 — 对照 old-vue-reader/components/AnnotationListPopup/index.vue
 */
import type { NoteItem } from '../../../types'
import './annotation-list-popup.css'

export interface AnnotationListPopupProps {
  visible: boolean
  items: NoteItem[]
  onClose: () => void
}

export function AnnotationListPopup(props: AnnotationListPopupProps): React.ReactNode {
  const { visible, items, onClose } = props

  if (!visible) {
    return null
  }

  return (
    <div className="annotation-list-popup" onClick={onClose}>
      <div className="annotation-list-popup__panel" onClick={(e) => e.stopPropagation()}>
        <div className="annotation-list-popup__content">
          <div className="annotation-list-popup__list">
            {items.map((item) => (
              <div key={item.webNoteId} className="annotation-list-popup__item">
                <div className="annotation-list-popup__text">{item.content}</div>
                <div className="annotation-list-popup__time">{item.time}</div>
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="annotation-list-popup__close" aria-label="关闭" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
