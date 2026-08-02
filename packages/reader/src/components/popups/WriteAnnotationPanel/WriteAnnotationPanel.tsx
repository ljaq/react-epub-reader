/**
 * 写批注面板 — 对照 old-vue-reader/components/WriteAnnotationPanel/index.vue
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnnotationStore } from '../../../store/annotation-store'
import './write-annotation-panel.css'

export interface WriteAnnotationPanelProps {
  onPublishNote?: (draft: {
    text: string
    chapterId: number
    posInfo: Record<string, number>
    content: string
  }) => void
  onNoteCreate?: (payload: import('../../../types').NoteItem) => void
}

export function WriteAnnotationPanel(props: WriteAnnotationPanelProps): React.ReactNode {
  const { onNoteCreate, onPublishNote } = props
  const visible = useAnnotationStore((s) => s.annotationPanelVisible)
  const draft = useAnnotationStore((s) => s.annotationDraft)
  const closeAnnotationPanel = useAnnotationStore((s) => s.closeAnnotationPanel)
  const [content, setContent] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const draftText = draft?.text || ''
  const canPublish = Boolean(content.trim())

  useEffect(() => {
    if (visible) {
      setContent('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [visible])

  const handleClose = useCallback(() => {
    closeAnnotationPanel()
  }, [closeAnnotationPanel])

  const handlePublish = useCallback(() => {
    if (!canPublish || !draft) return

    const trimmed = content.trim()
    if (onPublishNote) {
      onPublishNote({
        text: draft.text,
        chapterId: draft.chapterId,
        posInfo: draft.posInfo || {},
        content: trimmed
      })
      closeAnnotationPanel()
      return
    }

    if (onNoteCreate) {
      const webNoteId = `er${Date.now()}${Math.floor(Math.random() * 10000)}`
      onNoteCreate({
        id: null,
        webNoteId,
        clientId: webNoteId,
        chapterId: draft.chapterId,
        posInfo: draft.posInfo || {},
        summary: draft.text,
        content: trimmed,
        time: '刚刚'
      })
      closeAnnotationPanel()
    }
  }, [canPublish, draft, content, onPublishNote, onNoteCreate, closeAnnotationPanel])

  if (!visible) {
    return null
  }

  return (
    <div className="write-annotation-panel">
      <div className="write-annotation-panel__header">
        <button type="button" className="write-annotation-panel__back" aria-label="返回" onClick={handleClose}>
          <svg
            className="write-annotation-panel__back-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M13.3186 2.24403L4.24409 11.3172C3.96247 11.5988 3.92454 12.0318 4.13032 12.3542L4.16786 12.4078L4.20625 12.4558L4.24869 12.5015L13.3233 21.5747C13.6346 21.886 14.1309 21.8995 14.4582 21.6153L14.5018 21.5747L14.5424 21.5311C14.813 21.2193 14.8136 20.7544 14.5442 20.442L14.5017 20.3963L6.01149 11.907L14.4971 3.42246C14.8083 3.11124 14.8219 2.61503 14.5378 2.28768L14.4971 2.24408C14.1717 1.91866 13.6441 1.91864 13.3186 2.24403Z"
              fill="black"
            />
          </svg>
        </button>
        <span className="write-annotation-panel__title">写批注</span>
        <button
          type="button"
          className={`write-annotation-panel__publish${
            !canPublish ? ' write-annotation-panel__publish--disabled' : ''
          }`}
          disabled={!canPublish}
          onClick={handlePublish}
        >
          发布
        </button>
      </div>
      <div className="write-annotation-panel__body">
        <p className="write-annotation-panel__quote">{draftText}</p>
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="write-annotation-panel__input"
          placeholder="写下你的批注..."
          rows={8}
        />
      </div>
    </div>
  )
}
