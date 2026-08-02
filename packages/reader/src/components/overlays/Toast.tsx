/**
 * 轻量 Toast — 对齐 Vue Vant Toast 文案反馈（划线/批注失败等）。
 */
import { useUiStore } from '../../store/ui-store'
import '../overlays/selection/selection.css'

export function ReaderToast(): React.ReactNode {
  const message = useUiStore((s) => s.toastMessage)
  if (!message) {
    return null
  }
  return (
    <div className="reader-toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}
