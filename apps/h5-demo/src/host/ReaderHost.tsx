/**
 * ReaderHost — API ↔ Reader 桥接（Phase 8）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Reader,
  type BookmarkItem,
  type LineItem,
  type NoteItem,
  type ReadingSnapshot
} from '@react-epub-reader/reader'
import {
  fetchBookMeta,
  fetchChapterContent,
  fetchChapterList,
  fetchCheckRead,
  fetchLineList,
  fetchNoteList,
  fetchBookmarks,
  fetchReadPosition,
  saveLine,
  editLine,
  deleteLine,
  saveNote,
  deleteNote,
  saveBookmark,
  deleteBookmark,
  saveReadPosition,
  fetchTtsAudio,
  reportTtsReadTime
} from '../api'
import { createThoughtsMenuSlot } from '../slots/thoughts-menu'
import {
  buildChapterAccessFromCheck,
  createEmptyHostState,
  getAdjacentChapterIds,
  mergeLineWithClientId,
  mergeNoteWithClientId,
  signalAnnotationFailure,
  stripReconciledClientIds,
  type HostState
} from './host-store'

export interface ReaderHostProps {
  bookId: number
  dataSource?: 'mock-api'
}

const chromeSlots = createThoughtsMenuSlot()

export function ReaderHost({ bookId }: ReaderHostProps) {
  const navigate = useNavigate()
  const [state, setState] = useState<HostState>(() => createEmptyHostState(bookId))
  const loadingChaptersRef = useRef<Set<number>>(new Set())
  const readyCalledRef = useRef(false)
  const positionInjectedRef = useRef(false)

  const loadChapter = useCallback(
    async (chapterId: number, width: number) => {
      if (loadingChaptersRef.current.has(chapterId)) return
      loadingChaptersRef.current.add(chapterId)

      setState((s) => ({
        ...s,
        chapterLoadStates: { ...s.chapterLoadStates, [chapterId]: 'loading' }
      }))

      try {
        const { content, access } = await fetchChapterContent(bookId, chapterId, width)
        setState((s) => {
          const chapterAccess = {
            ...s.chapterAccess,
            [chapterId]: {
              chapterId,
              canRead: access.ok,
              needLogin: access.needLogin,
              needPurchase: access.needPurchase,
              isLoggedIn: s.user.isLoggedIn
            }
          }
          if (!content) {
            return {
              ...s,
              chapterAccess,
              chapterLoadStates: { ...s.chapterLoadStates, [chapterId]: access.ok ? 'error' : 'ready' }
            }
          }
          return {
            ...s,
            chapterAccess,
            chapters: { ...s.chapters, [chapterId]: content },
            chapterLoadStates: { ...s.chapterLoadStates, [chapterId]: 'ready' }
          }
        })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[ReaderHost] loadChapter failed', chapterId, error)
        setState((s) => ({
          ...s,
          chapterLoadStates: { ...s.chapterLoadStates, [chapterId]: 'error' }
        }))
      } finally {
        loadingChaptersRef.current.delete(chapterId)
      }
    },
    [bookId]
  )

  const prefetchChapters = useCallback(
    (chapterIds: number[], width: number) => {
      chapterIds.forEach((id) => {
        void loadChapter(id, width)
      })
    },
    [loadChapter]
  )

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setState(createEmptyHostState(bookId))
      readyCalledRef.current = false
      positionInjectedRef.current = false
      loadingChaptersRef.current.clear()

      try {
        const [bookMeta, chapterList, lines, notes, bookmarks, savedPosition] = await Promise.all([
          fetchBookMeta(bookId),
          fetchChapterList(bookId),
          fetchLineList(bookId),
          fetchNoteList(bookId),
          fetchBookmarks(bookId),
          fetchReadPosition(bookId)
        ])

        if (cancelled) return

        const checkResults: Record<
          number,
          { canRead: boolean; needLogin: boolean; needPurchase: boolean; isLoggedIn?: boolean }
        > = {}
        await Promise.all(
          chapterList.map(async (ch) => {
            const r = await fetchCheckRead(bookId, ch.id)
            checkResults[ch.id] = {
              canRead: r.canRead,
              needLogin: r.needLogin,
              needPurchase: !r.canRead && r.needLogin,
              isLoggedIn: r.isLoggedIn
            }
          })
        )

        if (cancelled) return

        const initialChapterId =
          savedPosition?.chapterId ?? chapterList[0]?.id
        const chapterAccess = buildChapterAccessFromCheck(chapterList, checkResults)
        const chapterLoadStates: HostState['chapterLoadStates'] = {}
        chapterList.forEach((ch) => {
          chapterLoadStates[ch.id] = 'idle'
        })

        // 对齐 Vue：首章 HTML + 阅读进度就绪后再挂载 Reader，避免先闪第一章/未分页溢出
        const chapters: HostState['chapters'] = {}
        if (initialChapterId != null) {
          chapterLoadStates[initialChapterId] = 'loading'
          const { content, access } = await fetchChapterContent(bookId, initialChapterId, 398)
          if (cancelled) return
          chapterAccess[initialChapterId] = {
            chapterId: initialChapterId,
            canRead: access.ok,
            needLogin: access.needLogin,
            needPurchase: access.needPurchase,
            isLoggedIn: true
          }
          if (content) {
            chapters[initialChapterId] = content
            chapterLoadStates[initialChapterId] = 'ready'
          } else {
            chapterLoadStates[initialChapterId] = access.ok ? 'error' : 'ready'
          }
        }

        if (cancelled) return

        positionInjectedRef.current = Boolean(savedPosition)
        setState((s) => ({
          ...s,
          bookMeta,
          chapterList,
          chapters,
          lines,
          notes,
          bookmarks,
          chapterAccess,
          chapterLoadStates,
          initialChapterId,
          initialPosition: savedPosition ?? undefined,
          ready: true,
          ttsVoiceTypes: s.ttsVoiceTypes.length
            ? s.ttsVoiceTypes
            : [
                { key: 'BV102_streaming', label: '儒雅青年' },
                { key: 'BV104_streaming', label: '温柔女声' },
                { key: 'BV123_streaming', label: '阳光青年' }
              ],
          user: { isLoggedIn: true, inBookshelf: false },
          bootstrapError: null
        }))

        if (initialChapterId != null) {
          const neighbors = getAdjacentChapterIds(chapterList, initialChapterId, 1)
          neighbors.forEach((id) => void loadChapter(id, 398))
        }
      } catch (error) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            bootstrapError: error instanceof Error ? error.message : String(error)
          }))
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [bookId, loadChapter])

  const onReady = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    // initialPosition 已在 bootstrap 同步注入；此处仅兜底（无进度时）
    if (positionInjectedRef.current) return
    void fetchReadPosition(bookId).then((saved) => {
      if (!saved || positionInjectedRef.current) return
      positionInjectedRef.current = true
      setState((s) => ({ ...s, initialPosition: saved }))
    })
  }, [bookId])

  const onChapterChange = useCallback(
    (chapterId: number, width: number) => {
      void loadChapter(chapterId, width)
      setState((s) => {
        const neighbors = getAdjacentChapterIds(s.chapterList, chapterId, 1)
        neighbors.forEach((id) => void loadChapter(id, width))
        return s
      })
    },
    [loadChapter]
  )

  const onPrefetch = useCallback(
    (chapterIds: number[], width: number) => {
      prefetchChapters(chapterIds, width)
    },
    [prefetchChapters]
  )

  const onLineCreate = useCallback(
    (payload: LineItem) => {
      const clientId = payload.clientId || payload.webLineId
      void saveLine(bookId, payload)
        .then((saved) => {
          setState((s) => {
            let next = mergeLineWithClientId(s.lines, payload.chapterId, saved, clientId)
            const { lines, notes } = stripReconciledClientIds(next, s.notes)
            return {
              ...s,
              lines,
              notes,
              clientIdMap: {
                ...s.clientIdMap,
                [clientId]: { serverKey: saved.webLineId, chapterId: payload.chapterId, kind: 'line' }
              },
              annotationFailure: null
            }
          })
          requestAnimationFrame(() => {
            setState((s) => {
              const { lines, notes } = stripReconciledClientIds(s.lines, s.notes)
              return { ...s, lines, notes }
            })
          })
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.warn('[ReaderHost] saveLine failed', error)
          setState((s) =>
            signalAnnotationFailure(s, {
              clientId,
              type: 'line',
              chapterId: payload.chapterId
            })
          )
        })
    },
    [bookId]
  )

  const onLineUpdate = useCallback(
    (payload: LineItem) => {
      const clientId = payload.clientId || payload.webLineId
      void editLine(bookId, payload)
        .then((saved) => {
          setState((s) => {
            let next = mergeLineWithClientId(s.lines, payload.chapterId, saved, clientId)
            const { lines, notes } = stripReconciledClientIds(next, s.notes)
            return { ...s, lines, notes }
          })
        })
        .catch((error) => {
          console.warn('[ReaderHost] editLine failed', error)
        })
    },
    [bookId]
  )

  const onLineDelete = useCallback(
    (payload: { bookId: number; webLineId: string }) => {
      void deleteLine(bookId, payload.webLineId)
        .then(() => {
          setState((s) => {
            const nextLines = { ...s.lines }
            Object.keys(nextLines).forEach((key) => {
              const cid = Number(key)
              if (nextLines[cid]?.[payload.webLineId]) {
                const bucket = { ...nextLines[cid] }
                delete bucket[payload.webLineId]
                nextLines[cid] = bucket
              }
            })
            return { ...s, lines: nextLines }
          })
        })
        .catch((error) => {
          console.warn('[ReaderHost] deleteLine failed', error)
        })
    },
    [bookId]
  )

  const onNoteCreate = useCallback(
    (payload: NoteItem) => {
      const clientId = payload.clientId || payload.webNoteId
      void saveNote(bookId, payload)
        .then((saved) => {
          setState((s) => {
            let next = mergeNoteWithClientId(s.notes, payload.chapterId, saved, clientId)
            const { lines, notes } = stripReconciledClientIds(s.lines, next)
            return { ...s, lines, notes, annotationFailure: null }
          })
          requestAnimationFrame(() => {
            setState((s) => {
              const { lines, notes } = stripReconciledClientIds(s.lines, s.notes)
              return { ...s, lines, notes }
            })
          })
        })
        .catch((error) => {
          console.warn('[ReaderHost] saveNote failed', error)
          setState((s) =>
            signalAnnotationFailure(s, {
              clientId,
              type: 'note',
              chapterId: payload.chapterId
            })
          )
        })
    },
    [bookId]
  )

  const onNoteDelete = useCallback(
    (payload: { bookId: number; webNoteId: string }) => {
      void deleteNote(bookId, payload.webNoteId).then(() => {
        setState((s) => {
          const nextNotes = { ...s.notes }
          Object.keys(nextNotes).forEach((key) => {
            const cid = Number(key)
            if (nextNotes[cid]?.[payload.webNoteId]) {
              const bucket = { ...nextNotes[cid] }
              delete bucket[payload.webNoteId]
              nextNotes[cid] = bucket
            }
          })
          return { ...s, notes: nextNotes }
        })
      })
    },
    [bookId]
  )

  const onBookmarkCreate = useCallback(
    (payload: BookmarkItem) => {
      void saveBookmark(bookId, payload)
        .then((saved) => {
          setState((s) => {
            const cid = payload.chapterId
            const list = [...(s.bookmarks[cid] || [])]
            const idx = list.findIndex((b) => b.id === saved.id)
            if (idx >= 0) list[idx] = { ...saved, time: '刚刚' }
            else list.push({ ...saved, time: '刚刚' })
            return { ...s, bookmarks: { ...s.bookmarks, [cid]: list } }
          })
        })
        .catch((error) => {
          console.warn('[ReaderHost] saveBookmark failed', error)
          setState((s) =>
            signalAnnotationFailure(s, {
              clientId: payload.id,
              type: 'bookmark',
              chapterId: payload.chapterId
            })
          )
        })
    },
    [bookId]
  )

  const onBookmarkDelete = useCallback(
    (payload: { bookId: number; chapterId: number; id: string }) => {
      void deleteBookmark(bookId, payload.chapterId, payload.id).then(() => {
        setState((s) => {
          const list = (s.bookmarks[payload.chapterId] || []).filter((b) => b.id !== payload.id)
          return { ...s, bookmarks: { ...s.bookmarks, [payload.chapterId]: list } }
        })
      })
    },
    [bookId]
  )

  const onReadingPositionChange = useCallback(
    (snapshot: ReadingSnapshot) => {
      void saveReadPosition(bookId, snapshot)
    },
    [bookId]
  )

  const onTtsAudioRequest = useCallback(
    (req: { reqId: string; text: string; voiceType: string; chapterId: number }) => {
      void fetchTtsAudio(bookId, req).then((entry) => {
        setState((s) => ({ ...s, ttsAudioUrl: entry }))
      })
    },
    [bookId]
  )

  const onTtsReadTimeReport = useCallback(
    (payload: { bookId: number; chapterId: number; seconds: number }) => {
      void reportTtsReadTime(bookId, payload)
    },
    [bookId]
  )

  const onLinkClick = useCallback((href: string) => {
    // eslint-disable-next-line no-console
    console.log('[ReaderHost] onLinkClick', href)
    if (href.startsWith('http')) {
      window.open(href, '_blank', 'noopener')
    }
  }, [])

  const onBookDetailClick = useCallback((id: number) => {
    // eslint-disable-next-line no-console
    console.log('[ReaderHost] onBookDetailClick', id)
  }, [])

  const onBookshelfAdd = useCallback((id: number) => {
    // eslint-disable-next-line no-console
    console.log('[ReaderHost] onBookshelfAdd', id)
    setState((s) => ({ ...s, user: { ...s.user, inBookshelf: true } }))
  }, [])

  const onLoginRequired = useCallback((reason: 'paid' | 'trial_end' | 'auth') => {
    // eslint-disable-next-line no-console
    console.log('[ReaderHost] onLoginRequired', reason)
  }, [])

  const onError = useCallback((payload: { scope: string; message: string }) => {
    console.warn('[ReaderHost] onError', payload)
  }, [])

  const onAnnotationError = useCallback(
    (payload: { clientId: string; type: 'line' | 'note' | 'bookmark'; error: unknown }) => {
      console.warn('[ReaderHost] onAnnotationError', payload)
    },
    []
  )

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path)
    },
    [navigate]
  )

  if (state.bootstrapError) {
    return (
      <div style={{ padding: 24 }}>
        <p>加载失败：{state.bootstrapError}</p>
        <button type="button" onClick={() => navigate('/')}>
          返回
        </button>
      </div>
    )
  }

  const initialReady =
    state.ready &&
    state.chapterList.length > 0 &&
    (state.initialChapterId == null || Boolean(state.chapters[state.initialChapterId]?.html))

  if (!initialReady) {
    return (
      <div
        className="reader-host-boot-loading"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff'
        }}
        aria-busy="true"
        aria-live="polite"
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: '3px solid rgba(0,0,0,0.1)',
            borderTopColor: '#1a1a1a',
            borderRadius: '50%',
            animation: 'reader-host-boot-spin 0.8s linear infinite'
          }}
        />
        <style>{`@keyframes reader-host-boot-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Reader
        bookId={bookId}
        initialChapterId={state.initialChapterId}
        initialPosition={state.initialPosition}
        chapterList={state.chapterList}
        chapters={state.chapters}
        chapterAccess={state.chapterAccess}
        chapterLoadStates={state.chapterLoadStates}
        lines={state.lines}
        notes={state.notes}
        bookmarks={state.bookmarks}
        bookMeta={state.bookMeta}
        user={state.user}
        ttsVoiceTypes={state.ttsVoiceTypes}
        ttsAudioUrl={state.ttsAudioUrl}
        chromeSlots={chromeSlots}
        navigate={handleNavigate}
        annotationFailure={state.annotationFailure}
        onChapterChange={onChapterChange}
        onPrefetch={onPrefetch}
        onLineCreate={onLineCreate}
        onLineUpdate={onLineUpdate}
        onLineDelete={onLineDelete}
        onNoteCreate={onNoteCreate}
        onNoteDelete={onNoteDelete}
        onBookmarkCreate={onBookmarkCreate}
        onBookmarkDelete={onBookmarkDelete}
        onAnnotationError={onAnnotationError}
        onReadingPositionChange={onReadingPositionChange}
        onLinkClick={onLinkClick}
        onBookDetailClick={onBookDetailClick}
        onBookshelfAdd={onBookshelfAdd}
        onLoginRequired={onLoginRequired}
        onTtsAudioRequest={onTtsAudioRequest}
        onTtsReadTimeReport={onTtsReadTimeReport}
        onReady={onReady}
        onError={onError}
      />
    </div>
  )
}
