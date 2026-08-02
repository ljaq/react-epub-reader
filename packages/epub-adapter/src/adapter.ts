import ePub from 'epubjs'
import type Book from 'epubjs/types/book'
import type { NavItem } from 'epubjs/types/navigation'
import type Section from 'epubjs/types/section'
import type { ChapterContent, ChapterMeta } from '@react-epub-reader/reader'
import {
  createResourceResolver,
  injectImageDimensions,
  prefetchChapterAssets,
  rewriteChapterHtml,
  stripUrlFragment,
  type ResourceResolver,
} from './resource-resolver'

/** EPUB 标注锚点转换（Phase 9 实现；本期预留接口） */
export interface AnchorConverter {
  cfiToDomPos(cfi: string, chapterId: number): string | null
  domPosToCfi(domPos: string, chapterId: number): string | null
}

export interface EpubBookMeta {
  bookName: string
  author: string
  bookPic: string
}

export interface EpubAdapterOptions {
  /** 目录 tag 默认值，对齐 mock 为「免费」 */
  defaultTag?: string
  /** 本地 EPUB 默认可读 */
  defaultIsOrder?: boolean
  anchorConverter?: AnchorConverter
}

export interface EpubAdapter {
  loadEpub(input: string | ArrayBuffer): Promise<ChapterMeta[]>
  getChapterContent(chapterId: number): Promise<ChapterContent>
  prefetch(chapterIds: number[]): Promise<void>
  getBookMeta(): EpubBookMeta | null
  /** 预留 CFI ↔ domPos 转换 */
  readonly anchorConverter?: AnchorConverter
  destroy?(): void
}

const DEFAULT_TAG = '免费'

function flattenNavLabels(items: NavItem[]): Map<string, string> {
  const map = new Map<string, string>()

  function walk(navItems: NavItem[]): void {
    for (const item of navItems) {
      const hrefKey = item.href?.split('#')[0]
      if (hrefKey && !map.has(hrefKey)) {
        map.set(hrefKey, item.label?.trim() || '')
      }
      if (item.subitems?.length) walk(item.subitems)
    }
  }

  walk(items)
  return map
}

function serializeChildNodes(el: Element): string {
  if (typeof XMLSerializer === 'undefined') {
    return el.innerHTML || el.textContent || ''
  }
  const serializer = new XMLSerializer()
  return Array.from(el.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('')
}

function extractBodyHtmlFromSection(section: Section): string {
  const doc = section.document
  if (doc) {
    const body = doc.getElementsByTagName('body')[0]
    if (body) return serializeChildNodes(body)
    const root = doc.documentElement
    if (root) return serializeChildNodes(root)
  }
  if (section.contents) return serializeChildNodes(section.contents)
  if (section.output) return extractBodyFromSerialized(section.output)
  return ''
}

function extractBodyFromSerialized(serialized: string): string {
  const match = serialized.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (match?.[1]) return match[1].trim()
  return serialized
}

function extractTitleFromHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const h1 = doc.querySelector('h1')
  if (h1?.textContent?.trim()) return h1.textContent.trim()
  const title = doc.querySelector('title')
  if (title?.textContent?.trim()) return title.textContent.trim()
  return ''
}

function estimateWordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length
}

function collectSpineSections(spine: Book['spine']): Section[] {
  const sections: Section[] = []
  spine.each((section: Section) => {
    sections.push(section)
  })
  return sections
}

function chapterNameFromSpine(
  href: string,
  navLabels: Map<string, string>,
  html: string,
  fallbackIndex: number
): string {
  const hrefKey = href.split('#')[0]
  const navLabel = navLabels.get(hrefKey)
  if (navLabel) return navLabel
  const fromHtml = extractTitleFromHtml(html)
  if (fromHtml) return fromHtml
  return `章节 ${fallbackIndex + 1}`
}

function extractFragmentHtml(html: string, fragment: string): string {
  if (!fragment || typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const anchor = doc.getElementById(fragment)
  if (!anchor) return html

  const body = doc.body
  const nodes: Node[] = []
  let capture = false
  for (const child of Array.from(body.childNodes)) {
    if (child === anchor || (child instanceof Element && child.contains(anchor))) {
      capture = true
    }
    if (capture) nodes.push(child)
  }
  if (!nodes.length) return html
  return nodes
    .map((node) => {
      if (node instanceof Element) return node.outerHTML
      return node.textContent || ''
    })
    .join('')
}

function splitSectionHref(href: string): { path: string; fragment: string } {
  const path = stripUrlFragment(href)
  const hashIdx = href.indexOf('#')
  const fragment = hashIdx >= 0 ? href.slice(hashIdx + 1) : ''
  return { path, fragment }
}

export function createEpubAdapter(options: EpubAdapterOptions = {}): EpubAdapter {
  const defaultTag = options.defaultTag ?? DEFAULT_TAG
  const defaultIsOrder = options.defaultIsOrder ?? true

  let book: Book | null = null
  let chapterList: ChapterMeta[] = []
  let bookMeta: EpubBookMeta | null = null
  let navLabels = new Map<string, string>()
  const contentCache = new Map<number, ChapterContent>()
  const resolvers = new Map<number, ResourceResolver>()
  const inflight = new Map<number, Promise<ChapterContent>>()

  function chapterIdToSpineIndex(chapterId: number): number {
    return chapterId - 1
  }

  function assertBook(): Book {
    if (!book) throw new Error('EpubAdapter: call loadEpub() before accessing chapters')
    return book
  }

  async function renderSectionHtml(spineIndex: number): Promise<{ html: string; href: string }> {
    const currentBook = assertBook()
    const section = currentBook.spine.get(spineIndex)
    if (!section) throw new Error(`EpubAdapter: spine section not found at index ${spineIndex}`)

    const rawHref = section.href || ''
    const { path: hrefPath, fragment } = splitSectionHref(rawHref)
    let html = ''

    try {
      const xml = (await currentBook.load(hrefPath)) as XMLDocument
      const body = xml.getElementsByTagName('body')[0]
      if (body) html = serializeChildNodes(body)
      else if (xml.documentElement) html = serializeChildNodes(xml.documentElement)
    } catch {
      await section.load()
      html = extractBodyHtmlFromSection(section)
      if (!html && section.output) html = extractBodyFromSerialized(section.output)
    }

    if (fragment && html) {
      html = extractFragmentHtml(html, fragment)
    }

    return { html, href: hrefPath || rawHref }
  }

  async function buildChapterContent(chapterId: number): Promise<ChapterContent> {
    const cached = contentCache.get(chapterId)
    if (cached) return cached

    const pending = inflight.get(chapterId)
    if (pending) return pending

    const task = (async () => {
      const spineIndex = chapterIdToSpineIndex(chapterId)
      const meta = chapterList.find((c) => c.id === chapterId)
      const { html: rawHtml, href } = await renderSectionHtml(spineIndex)

      const resolver = createResourceResolver({ book: assertBook(), sectionHref: href })
      resolvers.set(chapterId, resolver)

      await prefetchChapterAssets(rawHtml, resolver)
      const html = rewriteChapterHtml(
        injectImageDimensions(rawHtml, resolver),
        resolver
      )

      const chapterName = meta?.chapterName
        || chapterNameFromSpine(href, navLabels, html, spineIndex)

      const wordCount = estimateWordCount(html)
      if (meta && meta.wordCount !== wordCount) {
        meta.wordCount = wordCount
      }

      const content: ChapterContent = {
        chapterId,
        chapterName,
        html,
        hasNext: chapterId < chapterList.length,
        pageButton: '',
        baseUrl: resolver.getBaseUrl(),
      }

      contentCache.set(chapterId, content)
      inflight.delete(chapterId)
      return content
    })()

    inflight.set(chapterId, task)
    try {
      return await task
    } catch (error) {
      inflight.delete(chapterId)
      throw error
    }
  }

  return {
    anchorConverter: options.anchorConverter,

    async loadEpub(input: string | ArrayBuffer): Promise<ChapterMeta[]> {
      if (book) {
        book.destroy()
        resolvers.forEach((r) => r.revokeObjectUrls())
        resolvers.clear()
        contentCache.clear()
        inflight.clear()
      }

      book = ePub({ openAs: typeof input === 'string' ? undefined : 'binary' }) as Book
      if (typeof input === 'string') {
        await book.open(input)
      } else {
        await book.open(input)
      }
      await book.ready

      navLabels = flattenNavLabels(book.navigation?.toc ?? [])

      const metadata = book.packaging?.metadata
      let cover = ''
      try {
        cover = (await book.coverUrl()) || ''
      } catch {
        cover = ''
      }

      bookMeta = {
        bookName: metadata?.title || 'EPUB',
        author: metadata?.creator || '佚名',
        bookPic: cover,
      }

      const spineItems = collectSpineSections(book.spine)
      chapterList = spineItems.map((section, index) => {
        const href = section.href || ''
        const hrefKey = href.split('#')[0]
        const chapterName = navLabels.get(hrefKey) || `章节 ${index + 1}`

        return {
          id: index + 1,
          chapterName,
          wordCount: 0,
          tag: defaultTag,
          isOrder: defaultIsOrder,
          anchorId: hrefKey || String(index + 1),
          index,
        } satisfies ChapterMeta
      })

      return chapterList
    },

    getChapterContent(chapterId: number): Promise<ChapterContent> {
      if (!chapterList.some((c) => c.id === chapterId)) {
        return Promise.reject(new Error(`EpubAdapter: unknown chapterId ${chapterId}`))
      }
      return buildChapterContent(chapterId)
    },

    async prefetch(chapterIds: number[]): Promise<void> {
      await Promise.all(
        chapterIds
          .filter((id) => !contentCache.has(id))
          .map((id) => buildChapterContent(id).catch(() => undefined))
      )
    },

    getBookMeta(): EpubBookMeta | null {
      return bookMeta
    },

    destroy(): void {
      resolvers.forEach((r) => r.revokeObjectUrls())
      resolvers.clear()
      contentCache.clear()
      inflight.clear()
      book?.destroy()
      book = null
      chapterList = []
      bookMeta = null
      navLabels = new Map()
    },
  }
}

/** 预留锚点转换占位实现（EPUB 模式本期不支持标注读写） */
export const noopAnchorConverter: AnchorConverter = {
  cfiToDomPos: () => null,
  domPosToCfi: () => null,
}
