/**
 * Native ↔ WebView JSON 协议类型（v1）
 */
import type {
  AnnotationFailureSignal,
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
  TtsVoiceType,
} from '@react-epub-reader/reader'

export const BRIDGE_VERSION = 1 as const

export interface BridgeMessage<T = unknown> {
  v: typeof BRIDGE_VERSION
  id?: string
  type: string
  payload?: T
}

// ── App → WebView 命令 ──

export const INBOUND_TYPES = {
  loadEpub: 'loadEpub',
  epubChunk: 'epubChunk',
  loadBook: 'loadBook',
  injectChapter: 'injectChapter',
  updateChapterAccess: 'updateChapterAccess',
  updateLines: 'updateLines',
  updateNotes: 'updateNotes',
  updateBookmarks: 'updateBookmarks',
  updateUser: 'updateUser',
  updateTtsVoiceTypes: 'updateTtsVoiceTypes',
  injectTtsAudio: 'injectTtsAudio',
  signalAnnotationFailure: 'signalAnnotationFailure',
  navigateThoughts: 'navigateThoughts',
  destroy: 'destroy',
} as const

export type InboundType = (typeof INBOUND_TYPES)[keyof typeof INBOUND_TYPES]

export interface EpubSource {
  kind: 'base64' | 'url'
  data: string
}

export interface LoadEpubPayload {
  bookId: number
  source: EpubSource
  initialChapterId?: number
  initialPosition?: ReadingSnapshot
  ttsVoiceTypes?: TtsVoiceType[]
}

export interface EpubChunkPayload {
  bookId: number
  chunkIndex: number
  totalChunks: number
  data: string
  /** 最后一个 chunk 携带完整 loadEpub 参数 */
  loadOptions?: Omit<LoadEpubPayload, 'source'> & { source?: never }
}

/** API 模式 bootstrap — App 请求后端后注入 */
export interface LoadBookPayload {
  bookId: number
  bookMeta: BookMeta
  chapterList: ChapterMeta[]
  chapterAccess: Record<number, ChapterAccess>
  chapters: Record<number, ChapterContent>
  chapterLoadStates: Record<number, ChapterLoadState>
  lines?: Record<number, Record<string, LineItem>>
  notes?: Record<number, Record<string, NoteItem>>
  bookmarks?: Record<number, BookmarkItem[]>
  user?: ReaderUser
  ttsVoiceTypes?: TtsVoiceType[]
  initialChapterId?: number
  initialPosition?: ReadingSnapshot
}

/** API 模式按需注入单章 — 响应 chapterChange / prefetch */
export interface InjectChapterPayload {
  chapterId: number
  content?: ChapterContent
  access?: ChapterAccess
  loadState: ChapterLoadState
}

export interface UpdateChapterAccessPayload {
  chapterAccess: Record<number, ChapterAccess>
  merge?: boolean
}

export interface UpdateLinesPayload {
  chapterId: number
  lines: LineItem[]
  /** true = 增量合并；false = 替换该章全部项（默认 true） */
  merge?: boolean
}

export interface UpdateNotesPayload {
  chapterId: number
  notes: NoteItem[]
  merge?: boolean
}

export interface UpdateBookmarksPayload {
  chapterId: number
  bookmarks: BookmarkItem[]
  merge?: boolean
}

export interface NavigateThoughtsPayload {
  screen: 'list' | 'write' | 'reader'
  thoughts?: ThoughtItem[]
}

/** 随感条目（Phase 1 仅存储，UI 由 App 或后续迭代提供） */
export interface ThoughtItem {
  id: string
  content: string
  likeCount?: number
}

export type SignalAnnotationFailurePayload = Omit<AnnotationFailureSignal, 'nonce'>

// ── WebView → App 事件 ──

export const OUTBOUND_TYPES = {
  bridgeReady: 'bridgeReady',
  epubLoaded: 'epubLoaded',
  bookLoaded: 'bookLoaded',
  ready: 'ready',
  chapterChange: 'chapterChange',
  prefetch: 'prefetch',
  lineCreate: 'lineCreate',
  lineUpdate: 'lineUpdate',
  lineDelete: 'lineDelete',
  noteCreate: 'noteCreate',
  noteDelete: 'noteDelete',
  bookmarkCreate: 'bookmarkCreate',
  bookmarkDelete: 'bookmarkDelete',
  annotationError: 'annotationError',
  readingPositionChange: 'readingPositionChange',
  ttsAudioRequest: 'ttsAudioRequest',
  ttsReadTimeReport: 'ttsReadTimeReport',
  navigate: 'navigate',
  linkClick: 'linkClick',
  bookDetailClick: 'bookDetailClick',
  bookshelfAdd: 'bookshelfAdd',
  loginRequired: 'loginRequired',
  error: 'error',
} as const

export type OutboundType = (typeof OUTBOUND_TYPES)[keyof typeof OUTBOUND_TYPES]

export interface EpubLoadedPayload {
  bookId: number
  bookMeta: BookMeta
  chapterList: ChapterMeta[]
}

export interface BookLoadedPayload {
  bookId: number
  bookMeta: BookMeta
  chapterList: ChapterMeta[]
}

export interface NavigatePayload {
  path: string
}

export function createMessage<T>(type: string, payload?: T, id?: string): BridgeMessage<T> {
  return { v: BRIDGE_VERSION, type, payload, id }
}

export function parseMessage(raw: string): BridgeMessage | null {
  try {
    const msg = JSON.parse(raw) as BridgeMessage
    if (msg.v !== BRIDGE_VERSION || typeof msg.type !== 'string') {
      return null
    }
    return msg
  } catch {
    return null
  }
}
