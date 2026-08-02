import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Reader,
  type ReaderProps,
  type BookmarkItem,
  type ChapterContent,
  type LineItem,
  type NoteItem,
  type ReadingSnapshot,
  type ChapterAccess,
  type ChapterLoadState,
  type TtsAudioEntry,
} from '@react-epub-reader/reader'
import { createEpubAdapter, type EpubAdapter } from '@react-epub-reader/epub-adapter'
import { createThoughtsMenuSlot } from './slots/thoughts-menu'
import { fetchTtsAudio } from './api'

const chromeSlots = createThoughtsMenuSlot()

function buildChapterAccess(chapterIds: number[]): Record<number, ChapterAccess> {
  const access: Record<number, ChapterAccess> = {}
  chapterIds.forEach((id) => {
    access[id] = {
      chapterId: id,
      canRead: true,
      needLogin: false,
      needPurchase: false,
      isLoggedIn: true,
    }
  })
  return access
}

export interface EpubReaderHostProps {
  /** 本地 File 或 public URL（如 /sample.epub） */
  source: File | string
  onExit: () => void
}

export function EpubReaderHost({ source, onExit }: EpubReaderHostProps) {
  const navigate = useNavigate()
  const adapterRef = useRef<EpubAdapter | null>(null)
  const [readerProps, setReaderProps] = useState<ReaderProps | null>(null)
  const [ttsAudioUrl, setTtsAudioUrl] = useState<TtsAudioEntry | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const adapter = createEpubAdapter()
    adapterRef.current = adapter
    let cancelled = false

    async function bootstrap() {
      setLoading(true)
      setLoadError(null)
      setReaderProps(null)

      try {
        const input =
          typeof source === 'string'
            ? source
            : await source.arrayBuffer()

        const chapterList = await adapter.loadEpub(input)
        if (cancelled) return

        const meta = adapter.getBookMeta()
        const ids = chapterList.map((c) => c.id)
        const initialChapterId = chapterList[0]?.id

        // 预加载全部章节后再挂载 Reader（对齐 Mock：chapters 全 ready + 分页一次稳定）
        const entries = await Promise.all(
          ids.map(async (id) => {
            try {
              const content = await adapter.getChapterContent(id)
              return [id, content] as const
            } catch (error) {
              // eslint-disable-next-line no-console
              console.warn('[epub-host] bootstrap chapter failed', id, error)
              return [id, undefined] as const
            }
          })
        )

        if (cancelled) return

        const chapters: Record<number, ChapterContent> = {}
        const chapterLoadStates: Record<number, ChapterLoadState> = {}
        entries.forEach(([id, content]) => {
          if (content?.html) {
            chapters[id] = content
            chapterLoadStates[id] = 'ready'
          } else {
            chapterLoadStates[id] = 'error'
          }
        })

        if (initialChapterId != null && !chapters[initialChapterId]) {
          throw new Error(`首章 ${initialChapterId} 加载失败`)
        }

        setReaderProps({
          bookId: 1,
          initialChapterId,
          chapterList,
          chapters,
          chapterAccess: buildChapterAccess(ids),
          chapterLoadStates,
          lines: {},
          notes: {},
          bookmarks: {},
          bookMeta: {
            bookId: 1,
            bookName: meta?.bookName || 'EPUB',
            author: meta?.author || '佚名',
            bookPic: meta?.bookPic || '',
            allowTts: true,
          },
          user: { isLoggedIn: true, inBookshelf: false },
          ttsVoiceTypes: [
            { key: 'BV102_streaming', label: '儒雅青年' },
            { key: 'BV104_streaming', label: '温柔女声' },
          ],
        })
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      adapter.destroy?.()
      adapterRef.current = null
    }
  }, [source])

  const fetchChapter = useCallback(async (chapterId: number) => {
    const adapter = adapterRef.current
    if (!adapter) return

    setReaderProps((p) => {
      if (!p || p.chapters[chapterId]?.html || p.chapterLoadStates[chapterId] === 'loading') {
        return p
      }
      return {
        ...p,
        chapterLoadStates: { ...p.chapterLoadStates, [chapterId]: 'loading' },
      }
    })

    try {
      const content = await adapter.getChapterContent(chapterId)
      setReaderProps((p) =>
        p
          ? {
              ...p,
              chapters: { ...p.chapters, [chapterId]: content },
              chapterLoadStates: { ...p.chapterLoadStates, [chapterId]: 'ready' },
            }
          : p
      )
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[epub-host] fetch chapter failed', chapterId, error)
      setReaderProps((p) =>
        p
          ? {
              ...p,
              chapterLoadStates: { ...p.chapterLoadStates, [chapterId]: 'error' },
            }
          : p
      )
    }
  }, [])

  const onChapterChange = useCallback(
    (chapterId: number, width: number) => {
      // eslint-disable-next-line no-console
      console.log('[epub-host] onChapterChange', { chapterId, width })
      void fetchChapter(chapterId)
    },
    [fetchChapter]
  )

  const onPrefetch = useCallback(
    (ids: number[], width: number) => {
      // eslint-disable-next-line no-console
      console.log('[epub-host] onPrefetch', { ids, width })
      ids.forEach((id) => void fetchChapter(id))
    },
    [fetchChapter]
  )

  const onReadingPositionChange = useCallback((snapshot: ReadingSnapshot) => {
    // eslint-disable-next-line no-console
    console.log('[epub-host] onReadingPositionChange', snapshot)
  }, [])

  const onTtsAudioRequest = useCallback(
    (req: { reqId: string; text: string; voiceType: string; chapterId: number }) => {
      void fetchTtsAudio(1, req).then((entry) => {
        setTtsAudioUrl(entry)
      })
    },
    []
  )

  const onLinkClick = useCallback((href: string) => {
    // eslint-disable-next-line no-console
    console.log('[epub-host] onLinkClick', href)
    if (href.startsWith('http')) {
      window.open(href, '_blank', 'noopener')
    }
  }, [])

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path)
    },
    [navigate]
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        正在加载 EPUB…
      </div>
    )
  }

  if (loadError || !readerProps) {
    return (
      <div style={{ padding: 24 }}>
        <p>EPUB 加载失败：{loadError || '未知错误'}</p>
        <button type="button" onClick={onExit}>返回</button>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <button
        type="button"
        onClick={onExit}
        style={{
          position: 'absolute',
          zIndex: 9999,
          top: 8,
          left: 8,
          padding: '4px 10px',
          fontSize: 12,
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        ← Mock API
      </button>
      <Reader
        {...readerProps}
        ttsAudioUrl={ttsAudioUrl}
        navigate={handleNavigate}
        chromeSlots={chromeSlots}
        onChapterChange={onChapterChange}
        onPrefetch={onPrefetch}
        onReadingPositionChange={onReadingPositionChange}
        onTtsAudioRequest={onTtsAudioRequest}
        onLinkClick={onLinkClick}
        onReady={() => console.log('[epub-host] onReady')}
        onError={(payload) => console.warn('[epub-host] onError', payload)}
        onLoginRequired={(reason) => console.log('[epub-host] onLoginRequired', reason)}
        onLineCreate={(payload: LineItem) => console.log('[epub-host] onLineCreate (EPUB defer)', payload)}
        onNoteCreate={(payload: NoteItem) => console.log('[epub-host] onNoteCreate (EPUB defer)', payload)}
        onBookmarkCreate={(payload: BookmarkItem) => console.log('[epub-host] onBookmarkCreate (EPUB defer)', payload)}
      />
    </div>
  )
}
