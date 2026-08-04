import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from '../routes'
import { resetReadingEngine } from './webview/reset-reading-engine'

export function H5ComponentMode() {
  useEffect(() => {
    resetReadingEngine()
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
