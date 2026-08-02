/**
 * Mock 内存 store — 写操作后 list 可读，字段对齐接口案例.md。
 */
import type {
  BookmarkItem,
  BookMeta,
  ChapterContent,
  ChapterMeta,
  LineItem,
  NoteItem,
  ReadingSnapshot,
  TtsVoiceType
} from '@react-epub-reader/reader'

const para = (text: string): string => `<p>${text}</p>`

const longBody = Array.from({ length: 24 }, (_, i) =>
  para(
    `第 ${i + 1} 段：这是 react-epub-reader Phase 8 Mock API 预览文本。横划模式下正文会被 CSS 多列布局切成多页。`
  )
).join('')

const shortBody = para('本章内容较短，仅一页。用于测试单页章节的边界行为。')

const CHAPTER_SEED: Record<number, Omit<ChapterContent, 'chapterId'>> = {
  1: { chapterName: '第一章 引子', html: para('引子：故事从这里开始。') + longBody, hasNext: true, pageButton: '' },
  2: {
    chapterName: '第二章 阅读引擎',
    html:
      `<h2>第二章 阅读引擎</h2>` +
      `<p>富媒体测试：<img src="https://picsum.photos/seed/reader-demo/400/240" alt="示例图" /></p>` +
      `<p>脚注测试：<img class="zhangyue-footnote" zy-footnote="这是脚注说明文字，点击图标可展开。" src="https://picsum.photos/seed/footnote/24/24" alt="*" /></p>` +
      `<p>链接测试：<a href="https://example.com/demo-link">示例外链</a></p>` +
      longBody +
      longBody,
    hasNext: true,
    pageButton: ''
  },
  3: { chapterName: '第三章 短章测试', html: shortBody, hasNext: true, pageButton: '' },
  4: {
    chapterName: '第四章 末章',
    html: para('这是最后一章，hasNext=false，章末按钮应置灰。') + longBody,
    hasNext: false,
    pageButton: ''
  }
}

export interface MockThoughtItem {
  id: number
  content: string
  likeCount: number
  likeNum?: number
  likeNumStr?: string
  liked: boolean
  time: string
  nickName?: string
  nick?: string
  avatar?: string
}

export interface MockStoreState {
  bookId: number
  bookMeta: BookMeta
  chapterList: ChapterMeta[]
  chapters: Record<number, ChapterContent>
  lines: Record<number, Record<string, LineItem>>
  notes: Record<number, Record<string, NoteItem>>
  bookmarks: Record<number, BookmarkItem[]>
  readingPosition: ReadingSnapshot | null
  ttsVoiceTypes: TtsVoiceType[]
  thoughts: MockThoughtItem[]
  nextLineId: number
  nextNoteId: number
  nextThoughtId: number
}

const stores = new Map<number, MockStoreState>()

function buildChapterList(): ChapterMeta[] {
  return [
    { id: 1, chapterName: '第一章 引子', wordCount: 1200, tag: '免费', isOrder: true, anchorId: 'ch1', index: 0 },
    { id: 2, chapterName: '第二章 阅读引擎', wordCount: 3600, tag: '免费', isOrder: true, anchorId: 'ch2', index: 1 },
    { id: 3, chapterName: '第三章 短章测试', wordCount: 80, tag: '免费', isOrder: true, anchorId: 'ch3', index: 2 },
    { id: 4, chapterName: '第四章 末章', wordCount: 2000, tag: '付费', isOrder: false, anchorId: 'ch4', index: 3 }
  ]
}

export function getOrCreateMockStore(bookId: number): MockStoreState {
  let store = stores.get(bookId)
  if (store) return store

  store = {
    bookId,
    bookMeta: {
      bookId,
      bookName: '示例书籍',
      author: '佚名',
      bookPic: '',
      paidChapterStart: 4,
      allowTts: true
    },
    chapterList: buildChapterList(),
    chapters: {},
    lines: {},
    notes: {},
    bookmarks: {},
    readingPosition: {
      chapterId: 2,
      domPos: '0=1=0=0#0',
      precent: 0.15,
      pageIndex: 0
    },
    ttsVoiceTypes: [
      { key: 'BV102_streaming', label: '儒雅青年' },
      { key: 'BV104_streaming', label: '温柔女声' },
      { key: 'BV123_streaming', label: '阳光青年' }
    ],
    thoughts: [
      {
        id: 1,
        content: '这本书写得真好！',
        likeCount: 12,
        likeNum: 12,
        likeNumStr: '12',
        liked: false,
        time: '1小时前',
        nickName: '书友小明',
        avatar: ''
      },
      {
        id: 2,
        content: '第二章的阅读引擎很流畅',
        likeCount: 5,
        likeNum: 5,
        likeNumStr: '5',
        liked: true,
        time: '3小时前',
        nickName: '阅读达人',
        avatar: ''
      }
    ],
    nextLineId: 1000,
    nextNoteId: 2000,
    nextThoughtId: 100
  }
  stores.set(bookId, store)
  return store
}

export function mockGetChapterContent(bookId: number, chapterId: number, _width?: number): ChapterContent {
  const store = getOrCreateMockStore(bookId)
  const cached = store.chapters[chapterId]
  if (cached?.html) return cached

  const seed = CHAPTER_SEED[chapterId]
  if (!seed) {
    throw new Error(`Mock 章节 ${chapterId} 不存在`)
  }
  const content: ChapterContent = { chapterId, ...seed }
  store.chapters[chapterId] = content
  return content
}

export function mockFetchChapterList(bookId: number): ChapterMeta[] {
  return getOrCreateMockStore(bookId).chapterList
}

export function mockFetchBookMeta(bookId: number): BookMeta {
  return getOrCreateMockStore(bookId).bookMeta
}

export function mockFetchCheckRead(bookId: number, chapterId: number) {
  const store = getOrCreateMockStore(bookId)
  const meta = store.chapterList.find((c) => c.id === chapterId)
  const isFree = meta?.tag === '免费'
  return {
    code: 0,
    body: {
      allFree: isFree ? 1 : 0,
      isFree: isFree ? 1 : 0,
      isLogin: 1
    }
  }
}

export function mockSaveLine(bookId: number, payload: LineItem): LineItem {
  const store = getOrCreateMockStore(bookId)
  const id = store.nextLineId++
  const item: LineItem = {
    ...payload,
    id,
    time: '刚刚'
  }
  const cid = payload.chapterId
  if (!store.lines[cid]) store.lines[cid] = {}
  store.lines[cid][payload.webLineId] = item
  return item
}

export function mockEditLine(bookId: number, payload: LineItem): LineItem {
  const store = getOrCreateMockStore(bookId)
  const cid = payload.chapterId
  const existing = store.lines[cid]?.[payload.webLineId]
  const item: LineItem = { ...existing, ...payload, time: existing?.time || '刚刚' }
  if (!store.lines[cid]) store.lines[cid] = {}
  store.lines[cid][payload.webLineId] = item
  return item
}

export function mockFetchLineList(bookId: number): Record<number, Record<string, LineItem>> {
  return getOrCreateMockStore(bookId).lines
}

export function mockDeleteLine(bookId: number, webLineId: string): void {
  const store = getOrCreateMockStore(bookId)
  Object.keys(store.lines).forEach((key) => {
    const cid = Number(key)
    if (store.lines[cid]?.[webLineId]) {
      delete store.lines[cid][webLineId]
    }
  })
}

export function mockSaveNote(bookId: number, payload: NoteItem): NoteItem {
  const store = getOrCreateMockStore(bookId)
  const id = store.nextNoteId++
  const item: NoteItem = { ...payload, id, time: '刚刚' }
  const cid = payload.chapterId
  if (!store.notes[cid]) store.notes[cid] = {}
  store.notes[cid][payload.webNoteId] = item
  return item
}

export function mockFetchNoteList(bookId: number): Record<number, Record<string, NoteItem>> {
  return getOrCreateMockStore(bookId).notes
}

export function mockDeleteNote(bookId: number, webNoteId: string): void {
  const store = getOrCreateMockStore(bookId)
  Object.keys(store.notes).forEach((key) => {
    const cid = Number(key)
    if (store.notes[cid]?.[webNoteId]) {
      delete store.notes[cid][webNoteId]
    }
  })
}

export function mockFetchBookmarks(bookId: number): Record<number, BookmarkItem[]> {
  return getOrCreateMockStore(bookId).bookmarks
}

export function mockSaveBookmark(bookId: number, payload: BookmarkItem): BookmarkItem {
  const store = getOrCreateMockStore(bookId)
  const cid = payload.chapterId
  const list = [...(store.bookmarks[cid] || [])]
  const idx = list.findIndex((b) => b.id === payload.id)
  const item = { ...payload, time: '刚刚' as string | undefined }
  if (idx >= 0) list[idx] = item
  else list.push(item)
  store.bookmarks[cid] = list
  return item
}

export function mockDeleteBookmark(bookId: number, chapterId: number, id: string): void {
  const store = getOrCreateMockStore(bookId)
  store.bookmarks[chapterId] = (store.bookmarks[chapterId] || []).filter((b) => b.id !== id)
}

export function mockSaveReadPosition(bookId: number, snapshot: ReadingSnapshot): void {
  getOrCreateMockStore(bookId).readingPosition = snapshot
}

export function mockFetchReadPosition(bookId: number): ReadingSnapshot | null {
  return getOrCreateMockStore(bookId).readingPosition
}

/** 短静音 MP3 data URL，供 TTS mock 播放 */
export const MOCK_TTS_SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6+v//8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MUZAMAAAGkAAAAAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'

export function mockFetchTtsAudio(_bookId: number, req: {
  reqId: string
  text: string
  voiceType: string
  chapterId: number
}): { reqId: string; url: string; text: string; voiceType: string } {
  return {
    reqId: req.reqId,
    url: MOCK_TTS_SILENT_MP3,
    text: req.text,
    voiceType: req.voiceType
  }
}

export function mockReportTtsReadTime(_bookId: number, _payload: {
  chapterId: number
  seconds: number
}): void {
  // no-op mock
}

export function mockFetchThoughtList(
  bookId: number,
  nextRowId?: number
): { lists: MockThoughtItem[]; pager: { hasNext: number; nextRowId: number } } {
  const all = getOrCreateMockStore(bookId).thoughts
  const pageSize = 10
  const start = nextRowId != null && nextRowId > 0 ? all.findIndex((t) => t.id === nextRowId) + 1 : 0
  const slice = all.slice(Math.max(0, start), Math.max(0, start) + pageSize)
  const hasNext = start + pageSize < all.length ? 1 : 0
  const next = hasNext ? slice[slice.length - 1]?.id ?? -1 : -1
  return {
    lists: slice,
    pager: { hasNext, nextRowId: next }
  }
}

export function mockLikeThought(bookId: number, thoughtId: number): void {
  const store = getOrCreateMockStore(bookId)
  const item = store.thoughts.find((t) => t.id === thoughtId)
  if (item && !item.liked) {
    item.liked = true
    item.likeCount += 1
  }
}

export function mockCancelThoughtLike(bookId: number, thoughtId: number): void {
  const store = getOrCreateMockStore(bookId)
  const item = store.thoughts.find((t) => t.id === thoughtId)
  if (item && item.liked) {
    item.liked = false
    item.likeCount = Math.max(0, item.likeCount - 1)
  }
}

export function mockSaveThought(bookId: number, content: string): MockThoughtItem {
  const store = getOrCreateMockStore(bookId)
  const item: MockThoughtItem = {
    id: store.nextThoughtId++,
    content,
    likeCount: 0,
    likeNum: 0,
    likeNumStr: '',
    liked: false,
    time: '刚刚',
    nickName: '我',
    avatar: ''
  }
  store.thoughts.unshift(item)
  return item
}

export function resetMockStore(bookId: number): void {
  stores.delete(bookId)
}
