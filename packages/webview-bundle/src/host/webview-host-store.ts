/**
 * WebView 宿主外部数据态 — 从 h5-demo/host-store 精简移植
 */
import type {
  BookmarkItem,
  BookMeta,
  ChapterAccess,
  ChapterContent,
  ChapterLoadState,
  ChapterMeta,
  LineItem,
  NoteItem,
  ReaderUser,
  ReadingSnapshot,
  TtsAudioEntry,
  TtsVoiceType,
} from '@react-epub-reader/reader'

export interface AnnotationFailureSignal {
  clientId: string
  type: 'line' | 'note' | 'bookmark'
  chapterId: number
  nonce: number
}

export type DataSource = 'epub' | 'api' | null

export interface WebViewHostState {
  bookId: number
  dataSource: DataSource
  loading: boolean
  ready: boolean
  bootstrapError: string | null
  chapterList: ChapterMeta[]
  chapters: Record<number, ChapterContent>
  chapterAccess: Record<number, ChapterAccess>
  chapterLoadStates: Record<number, ChapterLoadState>
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  bookmarks: Record<number, BookmarkItem[]>
  bookMeta: BookMeta
  user: ReaderUser
  ttsVoiceTypes: TtsVoiceType[]
  ttsAudioUrl: TtsAudioEntry | null
  initialChapterId?: number
  initialPosition?: ReadingSnapshot
  annotationFailure: AnnotationFailureSignal | null
}

export function createEmptyHostState(bookId = 0): WebViewHostState {
  return {
    bookId,
    dataSource: null,
    loading: false,
    ready: false,
    bootstrapError: null,
    chapterList: [],
    chapters: {},
    chapterAccess: {},
    chapterLoadStates: {},
    lines: {},
    notes: {},
    bookmarks: {},
    bookMeta: { bookId, bookName: '', author: '', bookPic: '' },
    user: { isLoggedIn: true, inBookshelf: false },
    ttsVoiceTypes: [],
    ttsAudioUrl: null,
    annotationFailure: null,
  }
}

export function buildChapterAccess(chapterIds: number[]): Record<number, ChapterAccess> {
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

export function mergeLineWithClientId(
  lines: Record<number, Record<string, LineItem>>,
  chapterId: number,
  item: LineItem,
  clientId: string,
): Record<number, Record<string, LineItem>> {
  const bucket = { ...(lines[chapterId] || {}) }
  bucket[item.webLineId] = { ...item, clientId }
  return { ...lines, [chapterId]: bucket }
}

export function mergeNoteWithClientId(
  notes: Record<number, Record<string, NoteItem>>,
  chapterId: number,
  item: NoteItem,
  clientId: string,
): Record<number, Record<string, NoteItem>> {
  const bucket = { ...(notes[chapterId] || {}) }
  bucket[item.webNoteId] = { ...item, clientId }
  return { ...notes, [chapterId]: bucket }
}

export function stripReconciledClientIds(
  lines: Record<number, Record<string, LineItem>>,
  notes: Record<number, Record<string, NoteItem>>,
): { lines: typeof lines; notes: typeof notes } {
  const nextLines = { ...lines }
  Object.keys(nextLines).forEach((key) => {
    const cid = Number(key)
    const bucket = { ...nextLines[cid] }
    Object.keys(bucket).forEach((id) => {
      const { clientId: _c, ...rest } = bucket[id]
      bucket[id] = rest
    })
    nextLines[cid] = bucket
  })

  const nextNotes = { ...notes }
  Object.keys(nextNotes).forEach((key) => {
    const cid = Number(key)
    const bucket = { ...nextNotes[cid] }
    Object.keys(bucket).forEach((id) => {
      const { clientId: _c, ...rest } = bucket[id]
      bucket[id] = rest
    })
    nextNotes[cid] = bucket
  })

  return { lines: nextLines, notes: nextNotes }
}

export function signalAnnotationFailure(
  prev: WebViewHostState,
  signal: Omit<AnnotationFailureSignal, 'nonce'>,
): WebViewHostState {
  return {
    ...prev,
    annotationFailure: {
      ...signal,
      nonce: (prev.annotationFailure?.nonce ?? 0) + 1,
    },
  }
}

export function applyUpdateLines(
  state: WebViewHostState,
  chapterId: number,
  items: LineItem[],
  merge = true,
): WebViewHostState {
  if (merge) {
    const bucket = { ...(state.lines[chapterId] || {}) }
    items.forEach((item) => {
      bucket[item.webLineId] = item
    })
    return { ...state, lines: { ...state.lines, [chapterId]: bucket } }
  }
  const bucket: Record<string, LineItem> = {}
  items.forEach((item) => {
    bucket[item.webLineId] = item
  })
  return { ...state, lines: { ...state.lines, [chapterId]: bucket } }
}

export function applyUpdateNotes(
  state: WebViewHostState,
  chapterId: number,
  items: NoteItem[],
  merge = true,
): WebViewHostState {
  if (merge) {
    const bucket = { ...(state.notes[chapterId] || {}) }
    items.forEach((item) => {
      bucket[item.webNoteId] = item
    })
    return { ...state, notes: { ...state.notes, [chapterId]: bucket } }
  }
  const bucket: Record<string, NoteItem> = {}
  items.forEach((item) => {
    bucket[item.webNoteId] = item
  })
  return { ...state, notes: { ...state.notes, [chapterId]: bucket } }
}

export function applyUpdateBookmarks(
  state: WebViewHostState,
  chapterId: number,
  bookmarks: BookmarkItem[],
  merge = true,
): WebViewHostState {
  if (merge) {
    const existing = state.bookmarks[chapterId] || []
    const byId = new Map(existing.map((b) => [b.id, b]))
    bookmarks.forEach((b) => byId.set(b.id, b))
    return { ...state, bookmarks: { ...state.bookmarks, [chapterId]: [...byId.values()] } }
  }
  return { ...state, bookmarks: { ...state.bookmarks, [chapterId]: bookmarks } }
}

export function applyInjectChapter(
  state: WebViewHostState,
  chapterId: number,
  loadState: ChapterLoadState,
  content?: ChapterContent,
  access?: ChapterAccess,
): WebViewHostState {
  const next: WebViewHostState = {
    ...state,
    chapterLoadStates: { ...state.chapterLoadStates, [chapterId]: loadState },
  }
  if (content) {
    next.chapters = { ...state.chapters, [chapterId]: content }
  }
  if (access) {
    next.chapterAccess = { ...state.chapterAccess, [chapterId]: access }
  }
  return next
}

export function applyUpdateChapterAccess(
  state: WebViewHostState,
  chapterAccess: Record<number, ChapterAccess>,
  merge = true,
): WebViewHostState {
  if (merge) {
    return { ...state, chapterAccess: { ...state.chapterAccess, ...chapterAccess } }
  }
  return { ...state, chapterAccess }
}
