import type Book from 'epubjs/types/book'

/** 去掉 URL fragment（#filepos…），archive 无法按带锚点路径取文件 */
export function stripUrlFragment(path: string): string {
  const hashIdx = path.indexOf('#')
  return hashIdx >= 0 ? path.slice(0, hashIdx) : path
}

function isDocumentLinkPath(path: string): boolean {
  const withoutFragment = stripUrlFragment(path.trim())
  return /\.x?html?$/i.test(withoutFragment)
}

/** 将相对路径解析为 OPF 包内绝对路径 */
export function resolveRelativePath(baseDir: string, relativePath: string): string {
  const trimmed = stripUrlFragment(relativePath.trim())
  if (!trimmed) return trimmed
  if (/^(https?:|blob:|data:)/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return trimmed.replace(/^\/+/, '')

  const stack = baseDir ? baseDir.replace(/\/+$/, '').split('/') : []
  for (const part of trimmed.split('/')) {
    if (part === '..') stack.pop()
    else if (part !== '.' && part !== '') stack.push(part)
  }
  return stack.join('/')
}

export function dirnameFromHref(href: string): string {
  const hashIdx = href.indexOf('#')
  const path = hashIdx >= 0 ? href.slice(0, hashIdx) : href
  const slashIdx = path.lastIndexOf('/')
  return slashIdx >= 0 ? path.slice(0, slashIdx + 1) : ''
}

export interface ImageDimensions {
  width: number
  height: number
}

export interface ResourceResolver {
  /** 同步读取已缓存的资源 URL（未缓存时返回原路径） */
  resolveAssetUrl(relativePath: string): string
  /** 异步加载并缓存 data:/blob:/绝对 URL */
  ensureAssetUrl(relativePath: string): Promise<string>
  /** 图片资源尺寸（ensure 后可用，供分页前占位） */
  getImageDimensions(relativePath: string): ImageDimensions | undefined
  /** 章节 OPF 相对目录基准（已 resolve） */
  getBaseUrl(): string
  revokeObjectUrls(): void
}

interface CreateResourceResolverOptions {
  book: Book
  sectionHref: string
}

function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'css':
      return 'text/css'
    case 'woff':
      return 'font/woff'
    case 'woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function isBinaryAssetPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return false
  return /^(png|jpe?g|gif|webp|svg|bmp|ico|woff2?|ttf|otf|eot|mp3|mp4|webm|pdf)$/i.test(ext)
}

function isImageAssetPath(path: string): boolean {
  return /^image\//.test(guessMimeType(path))
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return URL.createObjectURL(blob)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

async function readImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') return null
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), 300)
    img.onload = () => {
      clearTimeout(timer)
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      } else {
        resolve(null)
      }
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

async function loadArchivedAsset(book: Book, absolutePath: string): Promise<Blob> {
  const mimeType = guessMimeType(absolutePath)
  const archive = (book as {
    archive?: { getBlob?: (url: string, mimeType?: string) => Promise<Blob | undefined> }
  }).archive

  if (archive?.getBlob && isBinaryAssetPath(absolutePath)) {
    const resolved = book.resolve(absolutePath)
    const blob = await archive.getBlob(resolved, mimeType)
    if (blob) return blob
  }

  const data = await book.load(absolutePath)
  return toBlob(data, mimeType)
}

function toBlob(data: unknown, mimeType: string): Blob {
  if (data instanceof Blob) return data
  if (data instanceof ArrayBuffer) return new Blob([data], { type: mimeType })
  if (typeof data === 'string') return new Blob([data], { type: mimeType })
  return new Blob([String(data)], { type: mimeType })
}

/** 从 HTML/CSS 文本中收集需重写的相对 url() */
export function collectRelativeAssetPaths(html: string): string[] {
  const paths = new Set<string>()

  const attrPattern = /\b(?:src|href|xlink:href)\s*=\s*(['"])(.*?)\1/gi
  let match: RegExpExecArray | null
  while ((match = attrPattern.exec(html)) !== null) {
    const value = match[2]?.trim()
    if (!value || /^(https?:|blob:|data:|#|mailto:|javascript:)/i.test(value)) continue
    // 跳过章节内链（如 part0040.html#filepos…），不是需内联的资源
    if (isDocumentLinkPath(value)) continue
    paths.add(value)
  }

  const urlPattern = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi
  while ((match = urlPattern.exec(html)) !== null) {
    const value = match[2]?.trim()
    if (!value || /^(https?:|blob:|data:|#)/i.test(value)) continue
    if (isDocumentLinkPath(value)) continue
    paths.add(value)
  }

  return [...paths]
}

export function createResourceResolver(options: CreateResourceResolverOptions): ResourceResolver {
  const { book, sectionHref } = options
  const packageDir = (book.path as { directory?: string } | undefined)?.directory ?? ''
  const baseDir = dirnameFromHref(sectionHref) || packageDir
  const baseUrl = book.archived
    ? baseDir
    : (book.resolve(baseDir, true) || baseDir)
  const cache = new Map<string, string>()
  const imageDimensions = new Map<string, ImageDimensions>()
  const blobUrls: string[] = []

  function cacheKey(relativePath: string): string {
    return resolveRelativePath(baseDir || packageDir, relativePath)
  }

  async function ensureAssetUrl(relativePath: string): Promise<string> {
    const trimmed = stripUrlFragment(relativePath.trim())
    if (!trimmed || /^(https?:|blob:|data:|#|mailto:|javascript:)/i.test(trimmed)) {
      return relativePath.trim()
    }
    if (isDocumentLinkPath(trimmed)) {
      return relativePath.trim()
    }

    const key = cacheKey(trimmed)
    const cached = cache.get(key)
    if (cached) return cached

    const absolutePath = key
    let resolved: string

    if (book.archived) {
      const blob = await loadArchivedAsset(book, absolutePath)
      // 图片内联为 data URL：避免 blob: 异步解码导致分页二次测量，
      // 跨章滑动时 globalPageIndex 被重映射、动画被 suppressTransition 打断（Mock 无图故无此问题）
      if (isImageAssetPath(absolutePath)) {
        resolved = await blobToDataUrl(blob)
        const dims = await readImageDimensions(resolved)
        if (dims) imageDimensions.set(key, dims)
      } else {
        resolved = URL.createObjectURL(blob)
        blobUrls.push(resolved)
      }
    } else {
      resolved = book.resolve(absolutePath, true) || absolutePath
    }

    cache.set(key, resolved)
    return resolved
  }

  function resolveAssetUrl(relativePath: string): string {
    const trimmed = stripUrlFragment(relativePath.trim())
    if (!trimmed || /^(https?:|blob:|data:|#|mailto:|javascript:)/i.test(trimmed)) {
      return relativePath.trim()
    }
    if (isDocumentLinkPath(trimmed)) {
      return relativePath.trim()
    }
    return cache.get(cacheKey(trimmed)) ?? relativePath.trim()
  }

  function getImageDimensions(relativePath: string): ImageDimensions | undefined {
    return imageDimensions.get(cacheKey(relativePath.trim()))
  }

  function revokeObjectUrls(): void {
    blobUrls.forEach((url) => URL.revokeObjectURL(url))
    blobUrls.length = 0
    cache.clear()
    imageDimensions.clear()
  }

  return {
    resolveAssetUrl,
    ensureAssetUrl,
    getImageDimensions,
    getBaseUrl: () => baseUrl,
    revokeObjectUrls,
  }
}

/** 预加载 HTML 内全部相对资源，再同步 rewrite */
export async function prefetchChapterAssets(
  html: string,
  resolver: ResourceResolver
): Promise<void> {
  const paths = collectRelativeAssetPaths(html)
  await Promise.all(paths.map((p) => resolver.ensureAssetUrl(p)))
}

/** 为 img 注入 width/height，保证首帧分页稳定（对齐 Mock 静态 HTML） */
export function injectImageDimensions(html: string, resolver: ResourceResolver): string {
  return html.replace(/<img\b([^>]*?)>/gi, (full, attrs: string) => {
    if (/\bwidth\s*=/i.test(attrs) && /\bheight\s*=/i.test(attrs)) return full
    const srcMatch = attrs.match(/\bsrc\s*=\s*(['"])(.*?)\1/i)
    if (!srcMatch) return full
    const dims = resolver.getImageDimensions(srcMatch[2])
    if (!dims) return full
    return `<img${attrs} width="${dims.width}" height="${dims.height}">`
  })
}

/** 批量改写 img/src、link href、style url() 等为可加载 URL */
export function rewriteChapterHtml(html: string, resolver: ResourceResolver): string {
  let output = html

  output = output.replace(
    /\b(src|href|xlink:href)\s*=\s*(['"])(.*?)\2/gi,
    (_match, attr: string, quote: string, value: string) => {
      if (attr.toLowerCase() === 'href' && isDocumentLinkPath(value)) {
        return `${attr}=${quote}${value}${quote}`
      }
      const resolved = resolver.resolveAssetUrl(value)
      return `${attr}=${quote}${resolved}${quote}`
    }
  )

  output = output.replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, (_match, quote: string, value: string) => {
    const resolved = resolver.resolveAssetUrl(value.trim())
    const q = quote || ''
    return `url(${q}${resolved}${q})`
  })

  return output
}
