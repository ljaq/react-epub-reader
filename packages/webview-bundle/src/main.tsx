import { createRoot } from 'react-dom/client'
import { WebViewReaderApp } from './WebViewReaderApp'
import { installBridge } from './bridge/dispatch'

installBridge()

createRoot(document.getElementById('root')!).render(
  <WebViewReaderApp />
)
