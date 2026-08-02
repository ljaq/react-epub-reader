/**
 * 正文富媒体点击分发 — 对照 Vue ReaderContent handleTap:1287-1317
 */
import { useCallback } from 'react'
import {
  isFootnoteImage,
  isPreviewableImage,
  resolveContentLink,
  resolvePreviewImageUrl
} from '../core/content-interactions'
import { useUiStore } from '../store/ui-store'

export interface UseContentRichMediaInput {
  onLinkClick?: (href: string) => void
}

/** 处理图片/脚注/链接点击；返回 true 表示已消费事件，不再走翻页/UI 分区逻辑 */
export function useContentRichMedia(input: UseContentRichMediaInput = {}) {
  const { onLinkClick } = input
  const toggleFootnote = useUiStore((s) => s.toggleFootnote)
  const showImagePreview = useUiStore((s) => s.showImagePreview)
  const hideFootnote = useUiStore((s) => s.hideFootnote)
  const footnoteVisible = useUiStore((s) => s.footnote.visible)

  const handleRichMediaTap = useCallback(
    (event: React.MouseEvent): boolean => {
      const target = event.target as HTMLElement

      const link = resolveContentLink(target)
      if (link?.href) {
        event.stopPropagation()
        event.preventDefault()
        onLinkClick?.(link.href)
        return true
      }

      const img = target.closest('img')
      if (img && isFootnoteImage(img)) {
        event.stopPropagation()
        toggleFootnote(img)
        return true
      }
      if (img && isPreviewableImage(img)) {
        event.stopPropagation()
        showImagePreview(resolvePreviewImageUrl(img))
        return true
      }

      if (footnoteVisible) {
        hideFootnote()
      }

      return false
    },
    [toggleFootnote, showImagePreview, hideFootnote, footnoteVisible, onLinkClick]
  )

  const hideFootnoteOnTouchMove = useCallback(() => {
    if (footnoteVisible) {
      hideFootnote()
    }
  }, [footnoteVisible, hideFootnote])

  return { handleRichMediaTap, hideFootnoteOnTouchMove }
}
