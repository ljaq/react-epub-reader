import { useEffect, useMemo, useRef, useState } from 'react'
import { MockNativeApp } from './MockNativeApp'

export interface WebViewSimModeProps {
  dataSource: 'api' | 'epub'
  epubSourceKind?: 'sample' | 'file'
  epubFile?: File | null
}

export function WebViewSimMode({
  dataSource,
  epubSourceKind = 'sample',
  epubFile = null,
}: WebViewSimModeProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (dataSource !== 'epub' || epubSourceKind !== 'file' || !epubFile) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      setBlobUrl(null)
      return
    }

    const url = URL.createObjectURL(epubFile)
    blobUrlRef.current = url
    setBlobUrl(url)

    return () => {
      URL.revokeObjectURL(url)
      blobUrlRef.current = null
    }
  }, [dataSource, epubSourceKind, epubFile])

  const epubSourceUrl = useMemo(() => {
    if (dataSource !== 'epub') return null
    if (epubSourceKind === 'sample') return `${window.location.origin}/sample.epub`
    return blobUrl
  }, [blobUrl, dataSource, epubSourceKind])

  const epubFileName = epubSourceKind === 'file' ? epubFile?.name : undefined

  return (
    <MockNativeApp
      dataSource={dataSource}
      epubSourceUrl={epubSourceUrl}
      epubFileName={epubFileName}
      onNavigate={(path) => {
        // eslint-disable-next-line no-console
        console.log('[WebViewSim] navigate', path)
      }}
    />
  )
}
