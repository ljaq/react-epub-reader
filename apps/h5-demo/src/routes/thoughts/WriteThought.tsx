/**
 * 写随感 — 1:1 对照 Vue WriteThought/index.vue
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveThought } from '../../api'
import './thoughts.css'

function BackIcon() {
  return (
    <svg className="write-thought__back-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M13.3186 2.24403L4.24409 11.3172C3.96247 11.5988 3.92454 12.0318 4.13032 12.3542L4.16786 12.4078L4.20625 12.4558L4.24869 12.5015L13.3233 21.5747C13.6346 21.886 14.1309 21.8995 14.4582 21.6153L14.5018 21.5747L14.5424 21.5311C14.813 21.2193 14.8136 20.7544 14.5442 20.442L14.5017 20.3963L6.01149 11.907L14.4971 3.42246C14.8083 3.11124 14.8219 2.61503 14.5378 2.28768L14.4971 2.24408C14.1717 1.91866 13.6441 1.91864 13.3186 2.24403Z"
        fill="black"
      />
    </svg>
  )
}

export interface WriteThoughtProps {
  bookId: number
}

export function WriteThought({ bookId }: WriteThoughtProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [content, setContent] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const canPublish = Boolean(content.trim())

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const handlePublish = async () => {
    const text = content.trim()
    if (!text || publishing) return

    setPublishing(true)
    try {
      await saveThought(bookId, text)
      setToast('发布成功')
      setTimeout(() => navigate(-1), 400)
    } catch {
      setToast('发布失败，请重试')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="write-thought">
      <div className="write-thought__header">
        <button type="button" className="write-thought__back" aria-label="返回" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
        <span className="write-thought__title">写随感</span>
        <button
          type="button"
          className={`write-thought__publish${!canPublish ? ' write-thought__publish--disabled' : ''}`}
          disabled={!canPublish || publishing}
          onClick={() => void handlePublish()}
        >
          发布
        </button>
      </div>
      <div className="write-thought__body">
        <textarea
          ref={inputRef}
          className="write-thought__input"
          placeholder="你的随感，是我平凡旅程里的一片星辰"
          rows={8}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      {toast ? <div className="thoughts-toast">{toast}</div> : null}
    </div>
  )
}
