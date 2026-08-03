import { createRoot } from 'react-dom/client'
import { WebViewReaderApp } from './WebViewReaderApp'
import { installBridge } from './bridge/dispatch'

import '@react-epub-reader/reader/style.css'

installBridge()

createRoot(document.getElementById('root')!).render(
  <WebViewReaderApp />
)
