import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, afterEach } from 'vitest'
import { createEpubAdapter } from '../adapter'
import {
  collectRelativeAssetPaths,
  createResourceResolver,
  injectImageDimensions,
  prefetchChapterAssets,
  resolveRelativePath,
  rewriteChapterHtml,
  stripUrlFragment,
} from '../resource-resolver'

const fixtureDir = dirname(fileURLToPath(import.meta.url))
const minimalEpubPath = join(fixtureDir, 'fixtures', 'minimal.epub')

describe('resource-resolver', () => {
  it('resolveRelativePath handles parent segments', () => {
    expect(resolveRelativePath('OEBPS/', 'images/pixel.png')).toBe('OEBPS/images/pixel.png')
    expect(resolveRelativePath('OEBPS/Text/', '../images/a.png')).toBe('OEBPS/images/a.png')
  })

  it('collectRelativeAssetPaths finds src and url()', () => {
    const html = '<img src="images/a.png"/><div style="background:url(../b.png)"></div>'
    const paths = collectRelativeAssetPaths(html)
    expect(paths).toContain('images/a.png')
    expect(paths).toContain('../b.png')
  })

  it('collectRelativeAssetPaths skips internal html links with #filepos', () => {
    const html = '<a href="part0040.html#filepos697168">note</a><img src="images/a.png"/>'
    const paths = collectRelativeAssetPaths(html)
    expect(paths).not.toContain('part0040.html#filepos697168')
    expect(paths).toContain('images/a.png')
  })

  it('stripUrlFragment removes hash segment', () => {
    expect(stripUrlFragment('text/part0040.html#filepos697168')).toBe('text/part0040.html')
  })

  it('rewriteChapterHtml replaces cached asset URLs', async () => {
    const book = {
      archived: false,
      resolve: (path: string) => `https://example.com/${path}`,
    }
    const resolver = createResourceResolver({ book: book as never, sectionHref: 'OEBPS/chapter1.xhtml' })
    await resolver.ensureAssetUrl('images/pixel.png')
    const rewritten = rewriteChapterHtml('<img src="images/pixel.png"/>', resolver)
    expect(rewritten).toContain('https://example.com/OEBPS/images/pixel.png')
    resolver.revokeObjectUrls()
  })
})

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

describe('createEpubAdapter', () => {
  let adapter = createEpubAdapter()

  afterEach(() => {
    adapter.destroy?.()
    adapter = createEpubAdapter()
  })

  it('loadEpub returns ChapterMeta with required fields', async () => {
    const bytes = readFileSync(minimalEpubPath)
    const arrayBuffer = toArrayBuffer(bytes)
    const chapterList = await adapter.loadEpub(arrayBuffer)

    expect(chapterList).toHaveLength(2)
    expect(chapterList[0]).toMatchObject({
      id: 1,
      chapterName: '第一章 开端',
      tag: '免费',
      isOrder: true,
      index: 0,
    })
    expect(chapterList[0].anchorId).toBeTruthy()
    expect(typeof chapterList[0].wordCount).toBe('number')
  })

  it('getChapterContent rewrites relative image paths to data URLs', async () => {
    const arrayBuffer = toArrayBuffer(readFileSync(minimalEpubPath))
    await adapter.loadEpub(arrayBuffer)

    const ch1 = await adapter.getChapterContent(1)
    expect(ch1.chapterId).toBe(1)
    expect(ch1.chapterName).toBe('第一章 开端')
    expect(ch1.pageButton).toBe('')
    expect(ch1.hasNext).toBe(true)
    expect(ch1.baseUrl).toBeTruthy()
    expect(ch1.html).toContain('data:image')
    expect(ch1.html).not.toContain('src="images/pixel.png"')
  })

  it('hasNext is false for the last chapter', async () => {
    const arrayBuffer = toArrayBuffer(readFileSync(minimalEpubPath))
    await adapter.loadEpub(arrayBuffer)

    const ch2 = await adapter.getChapterContent(2)
    expect(ch2.hasNext).toBe(false)
  })

  it('prefetch caches chapters without throwing', async () => {
    const arrayBuffer = toArrayBuffer(readFileSync(minimalEpubPath))
    await adapter.loadEpub(arrayBuffer)

    await expect(adapter.prefetch([1, 2])).resolves.toBeUndefined()
    const ch1again = await adapter.getChapterContent(1)
    expect(ch1again.html.length).toBeGreaterThan(0)
  })

  it('getBookMeta returns title and author from EPUB metadata', async () => {
    const arrayBuffer = toArrayBuffer(readFileSync(minimalEpubPath))
    await adapter.loadEpub(arrayBuffer)

    expect(adapter.getBookMeta()).toMatchObject({
      bookName: 'Minimal Test Book',
      author: 'Test Author',
    })
  })
})

describe('prefetchChapterAssets', () => {
  it('loads image assets as data URLs before rewrite', async () => {
    const book = {
      archived: true,
      resolve: (path: string) => `/${path}`,
      archive: {
        getBlob: async () => new Blob([1, 2, 3], { type: 'image/png' }),
      },
      load: async () => {
        throw new Error('book.load should not be used for png')
      },
    }
    const resolver = createResourceResolver({ book: book as never, sectionHref: 'OEBPS/chapter1.xhtml' })
    const html = '<img src="images/pixel.png"/>'
    await prefetchChapterAssets(html, resolver)
    const rewritten = rewriteChapterHtml(injectImageDimensions(html, resolver), resolver)
    expect(rewritten).toContain('data:image/png;base64,')
    resolver.revokeObjectUrls()
  })
})
