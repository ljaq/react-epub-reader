import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { USE_MOCK, setUseMock } from '../api'
import type { DemoMode, EpubSourceKind } from '../modes/types'

export interface DevPanelProps {
  mode: DemoMode
  onModeChange: (mode: DemoMode) => void
  epubSourceKind: EpubSourceKind
  onEpubSourceKindChange: (kind: EpubSourceKind) => void
  onFileSelected: (file: File) => void
  mockFailures: { line: boolean; note: boolean; bookmark: boolean }
  onMockFailuresChange: (next: Partial<{ line: boolean; note: boolean; bookmark: boolean }>) => void
}

export function DevPanel({
  mode,
  onModeChange,
  epubSourceKind,
  onEpubSourceKindChange,
  onFileSelected,
  mockFailures,
  onMockFailuresChange,
}: DevPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!import.meta.env.DEV) return null

  return (
    <>
      <button
        type="button"
        aria-label="打开演示设置"
        onClick={() => setOpen(true)}
        style={triggerStyle}
      >
        演示
      </button>

      {open && (
        <div
          role="presentation"
          style={backdropStyle}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dev-panel-title"
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <h2 id="dev-panel-title" style={modalTitleStyle}>
                演示设置
              </h2>
              <button type="button" onClick={() => setOpen(false)} style={closeBtnStyle}>
                关闭
              </button>
            </div>

            <div style={modalBodyStyle}>
              <label style={fieldStyle}>
                演示模式
                <select
                  value={mode}
                  onChange={(e) => onModeChange(e.target.value as DemoMode)}
                  style={selectStyle}
                >
                  <option value="h5-component">H5 组件（直挂 Reader）</option>
                  <option value="webview-api">WebView 模拟 · API 模式</option>
                  <option value="webview-epub">WebView 模拟 · EPUB 模式</option>
                </select>
              </label>

              {(mode === 'h5-component' || mode === 'webview-api') && (
                <label style={checkboxFieldStyle}>
                  <input
                    type="checkbox"
                    checked={USE_MOCK}
                    onChange={(e) => setUseMock(e.target.checked)}
                    style={checkboxInputStyle}
                  />
                  <span>USE_MOCK（切换后自动刷新）</span>
                </label>
              )}

              {mode === 'webview-epub' && (
                <label style={fieldStyle}>
                  EPUB 来源
                  <select
                    value={epubSourceKind}
                    onChange={(e) => onEpubSourceKindChange(e.target.value as EpubSourceKind)}
                    style={selectStyle}
                  >
                    <option value="sample">sample.epub</option>
                    <option value="file">本地文件</option>
                  </select>
                </label>
              )}

              <fieldset style={fieldsetStyle}>
                <legend style={{ fontSize: 11 }}>下次操作模拟失败</legend>
                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={mockFailures.line}
                    onChange={(e) => onMockFailuresChange({ line: e.target.checked })}
                    style={checkboxInputStyle}
                  />
                  <span>划线失败</span>
                </label>
                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={mockFailures.note}
                    onChange={(e) => onMockFailuresChange({ note: e.target.checked })}
                    style={checkboxInputStyle}
                  />
                  <span>批注失败</span>
                </label>
                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={mockFailures.bookmark}
                    onChange={(e) => onMockFailuresChange({ bookmark: e.target.checked })}
                    style={checkboxInputStyle}
                  />
                  <span>书签失败</span>
                </label>
              </fieldset>

              {mode === 'webview-epub' && epubSourceKind === 'file' && (
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
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const triggerStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 9999,
  right: 12,
  bottom: 12,
  padding: '8px 14px',
  fontSize: 12,
  borderRadius: 20,
  border: '1px solid #ddd',
  background: 'rgba(255,255,255,0.95)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  cursor: 'pointer',
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(0,0,0,0.35)',
}

const modalStyle: CSSProperties = {
  width: '100%',
  maxWidth: 360,
  maxHeight: 'min(80vh, 520px)',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
}

const modalHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 16px',
  borderBottom: '1px solid #eee',
}

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
}

const closeBtnStyle: CSSProperties = {
  fontSize: 12,
  padding: '4px 10px',
  cursor: 'pointer',
}

const modalBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '12px 16px 16px',
  fontSize: 12,
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const selectStyle: CSSProperties = {
  width: '100%',
}

const checkboxFieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  userSelect: 'none',
}

const checkboxInputStyle: CSSProperties = {
  flexShrink: 0,
  margin: 0,
}

const fieldsetStyle: CSSProperties = {
  border: '1px solid #ddd',
  padding: '8px 10px',
  margin: 0,
  borderRadius: 6,
}

const checkboxRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginTop: 6,
  cursor: 'pointer',
  userSelect: 'none',
}
