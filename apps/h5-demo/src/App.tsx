import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { USE_MOCK, getMockFailureFlags, setMockFailureFlags } from './api'
import { EpubReaderHost } from './epub-host'

type DataSourceMode = 'mock' | 'epub-file' | 'epub-sample'

function DevPanel({
  mode,
  onModeChange,
  onFileSelected,
  useMock,
  onUseMockChange,
  mockFailures,
  onMockFailuresChange
}: {
  mode: DataSourceMode
  onModeChange: (mode: DataSourceMode) => void
  onFileSelected: (file: File) => void
  useMock: boolean
  onUseMockChange: (v: boolean) => void
  mockFailures: { line: boolean; note: boolean; bookmark: boolean }
  onMockFailuresChange: (next: Partial<{ line: boolean; note: boolean; bookmark: boolean }>) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  if (!import.meta.env.DEV) return null

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 10000,
        top: 8,
        right: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: 'rgba(255,255,255,0.95)',
        padding: '8px 12px',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontSize: 12,
        maxWidth: 280
      }}
    >
      <label>
        数据源：
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as DataSourceMode)}
          style={{ marginLeft: 4 }}
        >
          <option value="mock">Mock API（路由）</option>
          <option value="epub-sample">EPUB（sample.epub）</option>
          <option value="epub-file">EPUB（本地文件）</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={useMock}
          onChange={(e) => onUseMockChange(e.target.checked)}
        />{' '}
        USE_MOCK（需刷新生效：{String(USE_MOCK)}）
      </label>
      <fieldset style={{ border: '1px solid #ddd', padding: '4px 8px', margin: 0 }}>
        <legend style={{ fontSize: 11 }}>下次操作模拟失败</legend>
        <label style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={mockFailures.line}
            onChange={(e) => onMockFailuresChange({ line: e.target.checked })}
          />{' '}
          划线失败
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={mockFailures.note}
            onChange={(e) => onMockFailuresChange({ note: e.target.checked })}
          />{' '}
          批注失败
        </label>
        <label style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={mockFailures.bookmark}
            onChange={(e) => onMockFailuresChange({ bookmark: e.target.checked })}
          />{' '}
          书签失败
        </label>
      </fieldset>
      {mode === 'epub-file' && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,application/epub+zip"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileSelected(file)
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            选择 .epub
          </button>
        </>
      )}
      <button type="button" onClick={() => navigate('/dev/epub')}>
        EPUB 独立路径
      </button>
    </div>
  )
}

function EpubOverlay({
  mode,
  epubFile,
  onExit
}: {
  mode: 'epub-sample' | 'epub-file'
  epubFile: File | null
  onExit: () => void
}) {
  if (mode === 'epub-file' && !epubFile) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontSize: 14,
          color: '#666'
        }}
      >
        请选择本地 .epub 文件
      </div>
    )
  }

  return (
    <EpubReaderHost
      source={mode === 'epub-sample' ? '/sample.epub' : epubFile!}
      onExit={onExit}
    />
  )
}

export function App() {
  const [mode, setMode] = useState<DataSourceMode>('mock')
  const [epubFile, setEpubFile] = useState<File | null>(null)
  const [useMockDisplay, setUseMockDisplay] = useState(USE_MOCK)
  const [mockFailures, setMockFailuresState] = useState(getMockFailureFlags())

  const handleModeChange = useCallback((next: DataSourceMode) => {
    setMode(next)
    if (next === 'epub-sample') {
      setEpubFile(null)
    }
  }, [])

  const handleMockFailuresChange = useCallback(
    (next: Partial<{ line: boolean; note: boolean; bookmark: boolean }>) => {
      setMockFailureFlags(next)
      setMockFailuresState(getMockFailureFlags())
    },
    []
  )

  const showEpub = mode === 'epub-sample' || (mode === 'epub-file' && epubFile)

  return (
    <BrowserRouter>
      <DevPanel
        mode={mode}
        onModeChange={handleModeChange}
        onFileSelected={setEpubFile}
        useMock={useMockDisplay}
        onUseMockChange={setUseMockDisplay}
        mockFailures={mockFailures}
        onMockFailuresChange={handleMockFailuresChange}
      />
      {showEpub ? (
        <EpubOverlay
          mode={mode as 'epub-sample' | 'epub-file'}
          epubFile={epubFile}
          onExit={() => {
            setMode('mock')
            setEpubFile(null)
          }}
        />
      ) : mode === 'epub-file' && !epubFile ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontSize: 14,
            color: '#666'
          }}
        >
          请选择本地 .epub 文件
        </div>
      ) : (
        <AppRoutes />
      )}
    </BrowserRouter>
  )
}
