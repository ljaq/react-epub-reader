import type { LoadBookPayload } from '@react-epub-reader/webview-bundle'
import {
  fetchBookMeta,
  fetchChapterContent,
  fetchChapterList,
  fetchCheckRead,
  fetchLineList,
  fetchNoteList,
  fetchBookmarks,
  fetchReadPosition,
} from '../../api'
import { buildChapterAccessFromCheck, getAdjacentChapterIds } from '../../host/host-store'
import type { ChapterContent, ChapterLoadState } from '@react-epub-reader/reader'

export const SAMPLE_BOOK_ID = 12535542

export async function buildApiLoadBookPayload(bookId = SAMPLE_BOOK_ID): Promise<LoadBookPayload> {
  const [bookMeta, chapterList, lines, notes, bookmarks, savedPosition] = await Promise.all([
    fetchBookMeta(bookId),
    fetchChapterList(bookId),
    fetchLineList(bookId),
    fetchNoteList(bookId),
    fetchBookmarks(bookId),
    fetchReadPosition(bookId),
  ])

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
        isLoggedIn: r.isLoggedIn,
      }
    }),
  )

  const initialChapterId = savedPosition?.chapterId ?? chapterList[0]?.id
  const chapterAccess = buildChapterAccessFromCheck(chapterList, checkResults)
  const chapterLoadStates: Record<number, ChapterLoadState> = {}
  chapterList.forEach((ch) => {
    chapterLoadStates[ch.id] = 'idle'
  })

  const chapters: Record<number, ChapterContent> = {}
  if (initialChapterId != null) {
    chapterLoadStates[initialChapterId] = 'loading'
    const { content, access } = await fetchChapterContent(bookId, initialChapterId, 398)
    chapterAccess[initialChapterId] = {
      chapterId: initialChapterId,
      canRead: access.ok,
      needLogin: access.needLogin,
      needPurchase: access.needPurchase,
      isLoggedIn: true,
    }
    if (content) {
      chapters[initialChapterId] = content
      chapterLoadStates[initialChapterId] = 'ready'
    } else {
      chapterLoadStates[initialChapterId] = access.ok ? 'error' : 'ready'
    }

    // 对齐 ReaderHost：预取相邻章，避免 Reader 组装 buffer 时 buffer.loading 卡住首屏
    const neighbors = getAdjacentChapterIds(chapterList, initialChapterId, 1)
    await Promise.all(
      neighbors.map(async (neighborId) => {
        if (chapters[neighborId]?.html) return
        try {
          const { content: neighborContent, access: neighborAccess } = await fetchChapterContent(
            bookId,
            neighborId,
            398,
          )
          chapterAccess[neighborId] = {
            chapterId: neighborId,
            canRead: neighborAccess.ok,
            needLogin: neighborAccess.needLogin,
            needPurchase: neighborAccess.needPurchase,
            isLoggedIn: true,
          }
          if (neighborContent) {
            chapters[neighborId] = neighborContent
            chapterLoadStates[neighborId] = 'ready'
          } else {
            chapterLoadStates[neighborId] = neighborAccess.ok ? 'error' : 'ready'
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[api-bootstrap] neighbor preload failed', neighborId, error)
          chapterLoadStates[neighborId] = 'error'
        }
      }),
    )
  }

  return {
    bookId,
    bookMeta,
    chapterList,
    chapterAccess,
    chapters,
    chapterLoadStates,
    lines,
    notes,
    bookmarks,
    user: { isLoggedIn: true, inBookshelf: false },
    ttsVoiceTypes: [
      { key: 'BV102_streaming', label: '儒雅青年' },
      { key: 'BV104_streaming', label: '温柔女声' },
      { key: 'BV123_streaming', label: '阳光青年' },
    ],
    initialChapterId,
    initialPosition: savedPosition ?? undefined,
  }
}

export async function injectChapterIfNeeded(
  bookId: number,
  chapterId: number,
  width: number,
  dispatch: (type: string, payload?: unknown) => void,
): Promise<void> {
  dispatch('injectChapter', {
    chapterId,
    loadState: 'loading',
  })

  try {
    const { content, access } = await fetchChapterContent(bookId, chapterId, width)
    if (content) {
      dispatch('injectChapter', {
        chapterId,
        content,
        access: {
          chapterId,
          canRead: access.ok,
          needLogin: access.needLogin,
          needPurchase: access.needPurchase,
          isLoggedIn: true,
        },
        loadState: 'ready',
      })
    } else {
      dispatch('injectChapter', {
        chapterId,
        access: {
          chapterId,
          canRead: access.ok,
          needLogin: access.needLogin,
          needPurchase: access.needPurchase,
          isLoggedIn: true,
        },
        loadState: access.ok ? 'error' : 'ready',
      })
    }
  } catch (error) {
    dispatch('injectChapter', {
      chapterId,
      loadState: 'error',
    })
    // eslint-disable-next-line no-console
    console.warn('[api-bootstrap] injectChapter failed', chapterId, error)
  }
}
