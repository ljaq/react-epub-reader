import { useNavigate } from 'react-router-dom'
import { EpubReaderHost } from '../epub-host'

/** EPUB 调试入口 — dev 模式 SourcePicker 跳转 */
export function EpubDebugPage() {
  const navigate = useNavigate()

  return (
    <EpubReaderHost
      source="/sample.epub"
      onExit={() => navigate('/')}
    />
  )
}
