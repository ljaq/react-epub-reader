/**
 * 图片预览 overlay — 1:1 对照 Vue ImagePreviewOverlay/index.vue
 */
import { useUiStore } from '../../../store/ui-store'
import './image-preview-overlay.css'

export function ImagePreviewOverlay(): React.ReactNode {
  const visible = useUiStore((s) => s.imagePreview.visible)
  const imageUrl = useUiStore((s) => s.imagePreview.url)
  const hideImagePreview = useUiStore((s) => s.hideImagePreview)

  return (
    <div
      className={`reader-image-preview${visible ? ' reader-image-preview--visible' : ''}`}
      onClick={() => hideImagePreview()}
    >
      {imageUrl ? (
        <img className="reader-image-preview__img" src={imageUrl} alt="" />
      ) : null}
    </div>
  )
}
