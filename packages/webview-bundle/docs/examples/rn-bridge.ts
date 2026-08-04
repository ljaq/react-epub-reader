/**
 * React Native WebView 集成参考（无 JSX，可直接复制到 RN 项目）
 *
 * 依赖：react-native-webview
 *
 * 用法：
 * 1. 将 packages/webview-bundle/dist/ 复制到 App 的 assets/webview/
 * 2. 使用 createRnBridge 封装 injectJavaScript / onMessage
 */

import type { RefObject } from 'react'
import type WebView from 'react-native-webview'

// ── 协议类型（与 packages/webview-bundle/src/bridge/protocol.ts 对齐）──

export interface BridgeMessage {
  v: 1
  id?: string
  type: string
  payload?: unknown
}

export interface LoadEpubPayload {
  bookId: number
  source: { kind: 'base64' | 'url'; data: string }
  initialChapterId?: number
  initialPosition?: ReadingSnapshot
  ttsVoiceTypes?: TtsVoiceType[]
}

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

export interface InjectChapterPayload {
  chapterId: number
  content?: ChapterContent
  access?: ChapterAccess
  loadState: ChapterLoadState
}

/** 与 reader 包契约对齐的精简类型（App 侧可从自家 API 层 import） */
export interface BookMeta {
  bookId: number
  bookName: string
  author: string
  bookPic: string
  allowTts?: boolean
}

export interface ChapterMeta {
  id: number
  chapterName: string
  wordCount: number
  tag: string
  isOrder: boolean
  anchorId: string
  index: number
}

export interface ChapterContent {
  chapterId: number
  chapterName: string
  html: string
  hasNext: boolean
  pageButton: string
  baseUrl?: string
}

export interface ChapterAccess {
  chapterId: number
  canRead: boolean
  needLogin: boolean
  needPurchase: boolean
  isLoggedIn: boolean
}

export type ChapterLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface LineItem {
  id: number | null
  webLineId: string
  clientId?: string
  chapterId: number
  posInfo: Record<string, number>
  summary: string
  underlineColor: string
}

export interface NoteItem {
  id: number | null
  webNoteId: string
  clientId?: string
  chapterId: number
  posInfo: Record<string, number>
  summary: string
  content: string
}

export interface BookmarkItem {
  id: string
  chapterId: number
  domPos: string
  summary: string
  precent: number
  cur: number
  totalPage: number
  h5PageY: number
  strIdx: number
}

export interface ReaderUser {
  isLoggedIn: boolean
  inBookshelf: boolean
}

export interface TtsVoiceType {
  key: string
  label: string
}

export interface ReadingSnapshot {
  chapterId: number
  domPos: string
  precent: number
  pageIndex?: number
  globalPageIndex?: number
}

// ── 工具函数 ──

export function createMessage(type: string, payload?: unknown, id?: string): string {
  return JSON.stringify({ v: 1, type, payload, id } satisfies BridgeMessage)
}

export function escapeForInject(json: string): string {
  return json.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function parseBridgeMessage(raw: string): BridgeMessage | null {
  try {
    const msg = JSON.parse(raw) as BridgeMessage
    if (msg.v !== 1 || typeof msg.type !== 'string') return null
    return msg
  } catch {
    return null
  }
}

// ── RN Bridge 封装 ──

export function createRnBridge(webViewRef: RefObject<WebView | null>) {
  return {
    dispatch(type: string, payload?: unknown) {
      const raw = createMessage(type, payload)
      webViewRef.current?.injectJavaScript(
        `window.__EpubReader.dispatch('${escapeForInject(raw)}'); true;`,
      )
    },
    loadEpub(epubUrl: string, bookId = 1, options?: Omit<LoadEpubPayload, 'bookId' | 'source'>) {
      this.dispatch('loadEpub', {
        bookId,
        source: { kind: 'url', data: epubUrl },
        ...options,
      } satisfies LoadEpubPayload)
    },
    loadBook(payload: LoadBookPayload) {
      this.dispatch('loadBook', payload)
    },
    injectChapter(payload: InjectChapterPayload) {
      this.dispatch('injectChapter', payload)
    },
    updateChapterAccess(chapterAccess: Record<number, ChapterAccess>, merge = true) {
      this.dispatch('updateChapterAccess', { chapterAccess, merge })
    },
    updateLines(chapterId: number, lines: LineItem[], merge = true) {
      this.dispatch('updateLines', { chapterId, lines, merge })
    },
    updateNotes(chapterId: number, notes: NoteItem[], merge = true) {
      this.dispatch('updateNotes', { chapterId, notes, merge })
    },
    updateBookmarks(chapterId: number, bookmarks: BookmarkItem[], merge = true) {
      this.dispatch('updateBookmarks', { chapterId, bookmarks, merge })
    },
    updateUser(user: ReaderUser) {
      this.dispatch('updateUser', user)
    },
    signalAnnotationFailure(
      clientId: string,
      type: 'line' | 'note' | 'bookmark',
      chapterId: number,
    ) {
      this.dispatch('signalAnnotationFailure', { clientId, type, chapterId })
    },
    injectTtsAudio(entry: { reqId: string; url: string; text: string; voiceType: string }) {
      this.dispatch('injectTtsAudio', entry)
    },
    destroy() {
      this.dispatch('destroy')
    },
  }
}

export type RnBridge = ReturnType<typeof createRnBridge>

/**
 * API 模式：处理 chapterChange / prefetch，按需请求后端并 injectChapter。
 * App 在 onMessage 中调用此函数即可。
 */
export async function handleApiChapterRequest(
  bridge: RnBridge,
  bookId: number,
  fetchChapter: (
    bookId: number,
    chapterId: number,
    width: number,
  ) => Promise<{ content?: ChapterContent; access?: ChapterAccess }>,
  chapterId: number,
  width: number,
): Promise<void> {
  bridge.injectChapter({ chapterId, loadState: 'loading' })
  try {
    const { content, access } = await fetchChapter(bookId, chapterId, width)
    bridge.injectChapter({
      chapterId,
      content,
      access,
      loadState: content?.html ? 'ready' : 'error',
    })
  } catch {
    bridge.injectChapter({ chapterId, loadState: 'error' })
  }
}

/**
 * EPUB 模式伪代码：
 *
 * ```tsx
 * onLoadEnd={() => bridge.loadEpub(epubFileUrl)}
 * ```
 *
 * API 模式伪代码：
 *
 * ```tsx
 * const bridge = createRnBridge(ref)
 *
 * // WebView onLoadEnd：App 拉完 bootstrap 数据后 loadBook
 * onLoadEnd={async () => {
 *   const [meta, chapterList, lines, notes, bookmarks, position] = await Promise.all([...])
 *   const { content, access } = await fetchChapterContent(bookId, initialChapterId, 398)
 *   bridge.loadBook({
 *     bookId,
 *     bookMeta: meta,
 *     chapterList,
 *     chapterAccess: { [initialChapterId]: access },
 *     chapters: { [initialChapterId]: content },
 *     chapterLoadStates: { [initialChapterId]: 'ready' },
 *     lines, notes, bookmarks,
 *     initialChapterId,
 *     initialPosition: position,
 *   })
 * }}
 *
 * // onMessage
 * onMessage={async (e) => {
 *   const msg = parseBridgeMessage(e.nativeEvent.data)
 *   if (msg?.type === 'chapterChange') {
 *     const { chapterId, width } = msg.payload as { chapterId: number; width: number }
 *     await handleApiChapterRequest(bridge, bookId, fetchChapterContent, chapterId, width)
 *   }
 *   if (msg?.type === 'prefetch') {
 *     const { chapterIds, width } = msg.payload as { chapterIds: number[]; width: number }
 *     for (const id of chapterIds) {
 *       await handleApiChapterRequest(bridge, bookId, fetchChapterContent, id, width)
 *     }
 *   }
 *   if (msg?.type === 'lineCreate') { ... }
 * }}
 * ```
 */
