/**
 * @react-epub-reader/epub-adapter
 *
 * epub.js → 统一数据契约适配层。Phase 7（子 Agent G）实现。
 * 详见 plans/phase-07-EpubAdapter.md。
 */
export {
  createEpubAdapter,
  noopAnchorConverter,
  type AnchorConverter,
  type EpubAdapter,
  type EpubAdapterOptions,
  type EpubBookMeta,
} from './adapter'

export {
  collectRelativeAssetPaths,
  createResourceResolver,
  dirnameFromHref,
  injectImageDimensions,
  prefetchChapterAssets,
  resolveRelativePath,
  rewriteChapterHtml,
  type ImageDimensions,
  type ResourceResolver,
} from './resource-resolver'

export type { ChapterContent, ChapterMeta } from '@react-epub-reader/reader'
