/**
 * 宿主外部数据态 — reader 内 store 不放这些。
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
  TtsVoiceType
} from '@react-epub-reader/reader'

export interface AnnotationFailureSignal {
  clientId: string
  type: 'line' | 'note' | 'bookmark'
  chapterId: number
  nonce: number
}

export interface HostState {
  bookId: number
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
  /** clientId → serverId，reconcile 一周期用 */
  clientIdMap: Record<string, { serverKey: string; chapterId: number; kind: 'line' | 'note' }>
  annotationFailure: AnnotationFailureSignal | null
}

export function createEmptyHostState(bookId: number): HostState {
  return {
    bookId,
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
    clientIdMap: {},
    annotationFailure: null
  }
}

export function buildChapterAccessFromCheck(
  chapterList: ChapterMeta[],
  checkResults: Record<number, { canRead: boolean; needLogin: boolean; needPurchase: boolean; isLoggedIn?: boolean }>
): Record<number, ChapterAccess> {
  const access: Record<number, ChapterAccess> = {}
  chapterList.forEach((ch) => {
    const r = checkResults[ch.id]
    access[ch.id] = {
      chapterId: ch.id,
      canRead: r?.canRead ?? true,
      needLogin: r?.needLogin ?? false,
      needPurchase: r?.needPurchase ?? false,
      isLoggedIn: r?.isLoggedIn ?? true
    }
  })
  return access
}

export function mergeLineWithClientId(
  lines: Record<number, Record<string, LineItem>>,
  chapterId: number,
  item: LineItem,
  clientId: string
): Record<number, Record<string, LineItem>> {
  const cid = chapterId
  const bucket = { ...(lines[cid] || {}) }
  bucket[item.webLineId] = { ...item, clientId }
  return { ...lines, [cid]: bucket }
}

export function mergeNoteWithClientId(
  notes: Record<number, Record<string, NoteItem>>,
  chapterId: number,
  item: NoteItem,
  clientId: string
): Record<number, Record<string, NoteItem>> {
  const cid = chapterId
  const bucket = { ...(notes[cid] || {}) }
  bucket[item.webNoteId] = { ...item, clientId }
  return { ...notes, [cid]: bucket }
}

export function stripReconciledClientIds(
  lines: Record<number, Record<string, LineItem>>,
  notes: Record<number, Record<string, NoteItem>>
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

export function getAdjacentChapterIds(
  chapterList: ChapterMeta[],
  centerId: number,
  radius = 1
): number[] {
  const idx = chapterList.findIndex((c) => c.id === centerId)
  if (idx < 0) return []
  const ids: number[] = []
  for (let i = idx - radius; i <= idx + radius; i += 1) {
    if (i >= 0 && i < chapterList.length && chapterList[i].id !== centerId) {
      ids.push(chapterList[i].id)
    }
  }
  return ids
}

export function signalAnnotationFailure(
  prev: HostState,
  signal: Omit<AnnotationFailureSignal, 'nonce'>
): HostState {
  return {
    ...prev,
    annotationFailure: {
      ...signal,
      nonce: (prev.annotationFailure?.nonce ?? 0) + 1
    }
  }
}
