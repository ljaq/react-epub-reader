/**
 * Reader Props / 回调 / 插槽契约 — 依赖 React 类型。
 *
 * 详见 plans/00-总览与契约.md §5（Props）、§6（回调）、§8（插槽边界）。
 * 本文件是唯一真理源的 TS 实现，子 Agent 不得擅自修改。
 */
import type { ReactNode } from 'react'
import type {
  BookMeta,
  BookmarkItem,
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
} from './index'

/** 插槽上下文（宿主注入路由方法等） */
export interface ReaderSlotCtx {
  bookId: number
  chapterId: number
  /** 宿主注入路由方法 */
  navigate: (path: string) => void
}

/**
 * 业务插槽（随感等，reader 零内置）。
 * reader 只提供锚点与上下文，路由/API 由宿主实现。
 */
export interface ReaderChromeSlots {
  topBarLeft?: (ctx: ReaderSlotCtx) => ReactNode
  topBarRight?: (ctx: ReaderSlotCtx) => ReactNode
  /** 顶栏「更多」菜单扩展项注入处（如随感入口） */
  topBarMoreMenu?: (ctx: ReaderSlotCtx) => ReactNode
  toolbarExtra?: (ctx: ReaderSlotCtx) => ReactNode
  contentOverlay?: (ctx: ReaderSlotCtx) => ReactNode
  bottomExtension?: (ctx: ReaderSlotCtx) => ReactNode
  rootOverlay?: (ctx: ReaderSlotCtx) => ReactNode
}

/** 宿主触发 reader 侧 rollback（host→reader 失败闭环） */
export interface AnnotationFailureSignal {
  clientId: string
  type: 'line' | 'note' | 'bookmark'
  chapterId: number
  /** 每次失败递增，供 useEffect 检测变化 */
  nonce: number
}

export interface ReaderProps {
  // ── 标识与初始化 ──
  bookId: number
  /** 默认取 chapterList[0].id 或上次位置 */
  initialChapterId?: number
  /** 恢复上次阅读位置 */
  initialPosition?: ReadingSnapshot

  // ── 章节数据 ──
  chapterList: ChapterMeta[]
  /** 按 chapterId 索引（非数组） */
  chapters: Record<number, ChapterContent>
  chapterAccess: Record<number, ChapterAccess>
  chapterLoadStates: Record<number, ChapterLoadState>

  // ── 标注数据（按章分组） ──
  /** [chapterId][webLineId] */
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  bookmarks: Record<number, BookmarkItem[]>

  // ── 书与用户 ──
  bookMeta: BookMeta
  user: ReaderUser

  // ── TTS ──
  ttsVoiceTypes: TtsVoiceType[]
  /** 宿主按 reqId 注入音频 URL */
  ttsAudioUrl?: TtsAudioEntry | null

  // ── 插槽（随感等业务，reader 零内置） ──
  chromeSlots?: ReaderChromeSlots

  // ── 宿主路由注入（供 ReaderSlotCtx.navigate 使用，reader 包零 react-router） ──
  navigate?: (path: string) => void

  // ── 回调（见 plans/00-总览与契约.md §6） ──
  onChapterChange?: (chapterId: number, width: number) => void
  onPrefetch?: (chapterIds: number[], width: number) => void
  onLineCreate?: (payload: LineItem) => void
  onLineUpdate?: (payload: LineItem) => void
  onLineDelete?: (payload: { bookId: number; webLineId: string }) => void
  onNoteCreate?: (payload: NoteItem) => void
  onNoteDelete?: (payload: { bookId: number; webNoteId: string }) => void
  onBookmarkCreate?: (payload: BookmarkItem) => void
  onBookmarkDelete?: (payload: { bookId: number; chapterId: number; id: string }) => void
  onAnnotationError?: (payload: {
    clientId: string
    type: 'line' | 'note' | 'bookmark'
    error: unknown
  }) => void
  onReadingPositionChange?: (snapshot: ReadingSnapshot) => void
  onLinkClick?: (href: string) => void
  onBookDetailClick?: (bookId: number) => void
  onBookshelfAdd?: (bookId: number) => void
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
  /** fire-and-forget；宿主拿到 URL 后通过 ttsAudioUrl prop 注入 */
  onTtsAudioRequest?: (req: {
    reqId: string
    text: string
    voiceType: string
    chapterId: number
  }) => void
  onTtsReadTimeReport?: (payload: { bookId: number; chapterId: number; seconds: number }) => void
  /** 阅读器初始化完成（宿主可注入 initialPosition） */
  onReady?: () => void
  onError?: (payload: { scope: string; message: string }) => void
  /** 宿主 API 失败时注入，触发 DOM rollback + 清 pending + Toast */
  annotationFailure?: AnnotationFailureSignal | null
}
