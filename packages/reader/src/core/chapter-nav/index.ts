/**
 * 章节导航 HTML 包裹。
 *
 * 源码对照：old-vue-reader/utils/chapter-nav-html.js:1-38
 *
 * 重要：源码中章首 pill「上一章」与章末通栏「下一章」按钮的注入逻辑已被注释掉
 * （chapter-nav-html.js:22-35），实际导航按钮由 Vue 组件 ReaderChrome/ChapterProgress
 * 与 ReaderContent 渲染（属 Phase 2 阅读引擎 UI 范畴）。本模块按源码现状 1:1 移植：
 * wrapChapterHtmlWithNav 仅负责 h5_mainbody_block 包裹；getChapterFlags 为纯函数供
 * Phase 2 组件复用。被注释的按钮 HTML 以常量形式保留，供 Phase 2 还原视觉时参考。
 */

export interface ChapterNavItem {
  id: number
}

export interface ChapterNavFlags {
  index: number
  hasPrev: boolean
  hasNext: boolean
}

/** 取章节导航标志：index/hasPrev/hasNext。对齐 Vue chapter-nav-html.js:1 */
export function getChapterNavFlags<T extends ChapterNavItem>(chapterList: T[], chapterId: number): ChapterNavFlags {
  const index = chapterList.findIndex(item => Number(item.id) === Number(chapterId))
  return {
    index,
    hasPrev: index > 0,
    hasNext: index >= 0 && index < chapterList.length - 1
  }
}

const MAINBODY_BLOCK_CLASS = 'h5_mainbody_block'
const MAINBODY_BLOCK_REGEX = /class="[^"]*h5_mainbody_block/u

function wrapWithMainbodyBlock(html: string): string {
  const content = html || ''
  if (MAINBODY_BLOCK_REGEX.test(content)) {
    return content
  }
  return `<div class="${MAINBODY_BLOCK_CLASS}">${content}</div>`
}

/**
 * 包装结果有界 LRU 缓存（phase-11）：key 为输入 html 字符串（输出唯一由其决定），
 * 同内容返回同一字符串引用——React dangerouslySetInnerHTML 的 __html diff 与
 * SegmentView/ChapterFlow memo 的 props 比较可 O(1) 短路。
 * 容量 8：buffer 窗口 ±1 章 + 加载占位足够，避免长书内存膨胀。
 */
const WRAP_CACHE_LIMIT = 8
const wrapCache = new Map<string, string>()

function wrapWithMainbodyBlockCached(html: string): string {
  const cached = wrapCache.get(html)
  if (cached !== undefined) {
    // LRU touch：删除重插刷新热度
    wrapCache.delete(html)
    wrapCache.set(html, cached)
    return cached
  }
  const wrapped = wrapWithMainbodyBlock(html)
  wrapCache.set(html, wrapped)
  if (wrapCache.size > WRAP_CACHE_LIMIT) {
    const oldest = wrapCache.keys().next().value
    if (oldest !== undefined) wrapCache.delete(oldest)
  }
  return wrapped
}

/**
 * 章首 pill「上一章」与章末通栏「下一章」按钮 HTML（源码 chapter-nav-html.js:22-35 注释块）。
 * 保留供 Phase 2 阅读引擎 UI 还原视觉时参考；本纯函数不注入。
 */
export const CHAPTER_NAV_BUTTON_HTML = {
  prevSlot:
    '<div class="reader-chapter-btn-slot reader-chapter-btn-slot--prev">' +
    '<button type="button" class="reader-chapter-btn reader-chapter-btn--prev" data-chapter-nav="prev">上一章</button>' +
    '</div>',
  nextSlot:
    '<div class="reader-chapter-btn-slot reader-chapter-btn-slot--next">' +
    '<button type="button" class="reader-chapter-btn reader-chapter-btn--next" data-chapter-nav="next">下一章</button>' +
    '</div>'
} as const

/**
 * 包裹章节 HTML：按源码现状仅套 `h5_mainbody_block`（章首 pill/章末通栏按钮在源码中已注释，
 * 由 Phase 2 组件渲染，按钮 HTML 见 CHAPTER_NAV_BUTTON_HTML）。对齐 Vue chapter-nav-html.js:18。
 * phase-11：经有界 LRU 缓存，同输入返回同一字符串引用（渲染层 diff 短路）。
 */
export function wrapChapterHtmlWithNav<T extends ChapterNavItem>(
  _chapterList: T[],
  _chapterId: number,
  html: string
): string {
  return wrapWithMainbodyBlockCached(html)
}
