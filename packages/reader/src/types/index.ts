/**
 * 冻结数据契约 — 纯数据类型，零 React 依赖。
 *
 * 字段严格对齐 old-vue-reader/prd/接口案例.md 真实返回与 utils/pos-info.js 锚点格式。
 * posInfo / domPos 编解码字节级沿用 Vue，不改格式。
 *
 * 详见 plans/00-总览与契约.md §4。本文件是唯一真理源的 TS 实现，子 Agent 不得擅自修改。
 */

// ───────────────────────── 章节 ─────────────────────────

/** 章节元数据（初始化全量注入，源自 /chapter 列表） */
export interface ChapterMeta {
  /** 稳定 ID（与锚点/标注关联） */
  id: number
  /** 章名（顶栏/目录显示） */
  chapterName: string
  wordCount: number
  /** "免费" / 付费标签（目录显示） */
  tag: string
  /** 是否已订购 */
  isOrder: boolean
  /** 书签锚点 id（bookmark 编码用） */
  anchorId: string
  /** 在 chapterList 中的序号（reader 侧补） */
  index: number
}

/** 章节内容（按需注入，源自 /nextchapter） */
export interface ChapterContent {
  chapterId: number
  /** 章名（章首/顶栏） */
  chapterName: string
  /** 渲染用 HTML 片段 */
  html: string
  /** 章末「下一章」按钮显隐/置灰 */
  hasNext: boolean
  pageButton: string
  /** EPUB 模式相对资源基准（H5 为空） */
  baseUrl?: string
}

/** 章节访问状态（按章注入，源自 /checkread + /nextchapter code） */
export interface ChapterAccess {
  chapterId: number
  canRead: boolean
  /** 10003 */
  needLogin: boolean
  /** 10004 */
  needPurchase: boolean
  isLoggedIn: boolean
}

/** 章节加载态（按章注入，reader 渲染骨架/错误用） */
export type ChapterLoadState = 'idle' | 'loading' | 'ready' | 'error'

// ───────────────────────── 标注 ─────────────────────────
// 锚点格式：posInfo = { "0=1=7=0#N": charCode, ... }，domPos = "0=1=7=0#N"
// 划线色值规则：underlineColor.length > 7 → 黄底；否则蓝线（沿用 line-highlight.js）

/** 划线（源自 /read/line/*，按 webLineId 索引） */
export interface LineItem {
  /** 服务端 id（pending 时为 null） */
  id: number | null
  /** 客户端临时 id（generateReaderWebId） */
  webLineId: string
  /** 乐观 UI reconcile 用（= webLineId，宿主回写时带回一个周期） */
  clientId?: string
  chapterId: number
  /** "0=1=7=0#N" → charCode */
  posInfo: Record<string, number>
  /** 摘要文本 */
  summary: string
  /** rgba(255,157,0,0.3) 黄底 | #0080FF 蓝线 */
  underlineColor: string
  /** "3分钟前"（笔记中心显示） */
  time?: string
}

/** 批注（源自 /read/note/*） */
export interface NoteItem {
  id: number | null
  webNoteId: string
  clientId?: string
  chapterId: number
  posInfo: Record<string, number>
  summary: string
  /** 批注正文 */
  content: string
  time?: string
}

/** 书签（源自 /getbookmark，按 chapter 分组） */
export interface BookmarkItem {
  /** = generateBookmarkId(chapterId, strIdx) 编码 */
  id: string
  chapterId: number
  /** "0=1=0=0#0" */
  domPos: string
  /** JSON 串或纯文本（encodeBookmarkSummary） */
  summary: string
  /** 注意：后端字段拼写为 precent，沿用 */
  precent: number
  /** 当前页 */
  cur: number
  totalPage: number
  /** 竖滚模式页 Y */
  h5PageY: number
  /** parseStrIdxFromBookmarkId */
  strIdx: number
  pageIndex?: number
  /** "3分钟前"（笔记中心显示） */
  time?: string
}

// ───────────────────────── 阅读进度 ─────────────────────────

export interface ReadingSnapshot {
  chapterId: number
  domPos: string
  precent: number
  pageIndex?: number
  globalPageIndex?: number
}

// ───────────────────────── 书与用户 ─────────────────────────

export interface BookMeta {
  bookId: number
  bookName: string
  author: string
  /** 封面 */
  bookPic: string
  /** 付费章起点 */
  paidChapterStart?: number
  /** 是否允许 TTS（Vue bookMeta.allowTts !== false 才显示语音朗读入口；默认 true） */
  allowTts?: boolean
}

export interface ReaderUser {
  isLoggedIn: boolean
  inBookshelf: boolean
}

// ───────────────────────── TTS ─────────────────────────

/** TTS 音色（宿主注入，reader 不内置音色列表） */
export interface TtsVoiceType {
  /** "BV102_streaming" */
  key: string
  label: string
}

/** TTS 音频注入（按 reqId 索引，对应 onTtsAudioRequest） */
export interface TtsAudioEntry {
  reqId: string
  url: string
  text: string
  voiceType: string
}
