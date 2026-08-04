import { useCallback, useState } from 'react'
import { getMockFailureFlags, setMockFailureFlags } from './api'
import { DevPanel } from './dev/DevPanel'
import type { DemoMode, EpubSourceKind } from './modes/types'
import { H5ComponentMode } from './modes/H5ComponentMode'
import { WebViewSimMode } from './modes/webview/WebViewSimMode'

export function App() {
  const [mode, setMode] = useState<DemoMode>('h5-component')
  const [epubSourceKind, setEpubSourceKind] = useState<EpubSourceKind>('sample')
  const [epubFile, setEpubFile] = useState<File | null>(null)
  const [mockFailures, setMockFailuresState] = useState(getMockFailureFlags())

  const handleModeChange = useCallback((next: DemoMode) => {
    setMode(next)
    if (next !== 'webview-epub') {
      setEpubFile(null)
      setEpubSourceKind('sample')
    }
  }, [])

  const handleMockFailuresChange = useCallback(
    (next: Partial<{ line: boolean; note: boolean; bookmark: boolean }>) => {
      setMockFailureFlags(next)
      setMockFailuresState(getMockFailureFlags())
    },
    [],
  )

  return (
    <>
      <DevPanel
        mode={mode}
        onModeChange={handleModeChange}
        epubSourceKind={epubSourceKind}
        onEpubSourceKindChange={setEpubSourceKind}
        onFileSelected={setEpubFile}
        mockFailures={mockFailures}
        onMockFailuresChange={handleMockFailuresChange}
      />

      {mode === 'h5-component' && <H5ComponentMode key="h5-component" />}

      {mode === 'webview-api' && <WebViewSimMode key="webview-api" dataSource="api" />}

      {mode === 'webview-epub' && (
        <WebViewSimMode
          key={`webview-epub-${epubSourceKind}-${epubFile?.name ?? 'sample'}`}
          dataSource="epub"
          epubSourceKind={epubSourceKind}
          epubFile={epubFile}
        />
      )}
    </>
  )
}
