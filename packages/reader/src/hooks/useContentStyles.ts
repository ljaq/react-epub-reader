/**
 * 内容样式 hook — 主题/字号/行距。
 *
 * 源码对照：old-vue-reader/utils/reader-content-styles.js:1-43
 *           old-vue-reader/components/ReaderContent/index.vue rootStyle:297 / contentBodyStyle:316
 *
 * - applyReaderParagraphStyles：upsert 3 个 <style> 标签（font-size / line-height / font-weight），
 *   选择器与 Vue 逐字一致：`.reader-content__body.read_c p` 与 `.reader-content__body.read_c`。
 * - rootStyle / contentBodyStyle：返回 CSS 变量对象，供组件挂到 root 与 body。
 */
import { useEffect, useMemo } from 'react'
import {
  resolveFontWeight,
  resolveLineHeight,
  THEME_MAP,
  useSettingsStore
} from '../store/settings-store'

const STYLE_IDS = {
  fontSize: 'reader_p_style_fs',
  lineHeight: 'reader_p_style_lh',
  fontWeight: 'reader_p_style_fw'
} as const

const PARAGRAPH_SELECTOR = '.reader-content__body.read_c p'
const READ_BODY_SELECTOR = '.reader-content__body.read_c'

function upsertInlineStyle(id: string, cssText: string): void {
  if (typeof document === 'undefined') {
    return
  }
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = cssText
}

function removeInlineStyle(id: string): void {
  if (typeof document === 'undefined') {
    return
  }
  const el = document.getElementById(id)
  if (el && el.parentNode) {
    el.parentNode.removeChild(el)
  }
}

/** 注入段落样式 <style>（font-size / line-height / font-weight）。对齐 Vue applyReaderParagraphStyles。 */
export function applyReaderParagraphStyles(input: {
  fontSize: number
  lineHeight: number
  fontWeight: number
}): void {
  upsertInlineStyle(STYLE_IDS.fontSize, `${PARAGRAPH_SELECTOR} { font-size: ${input.fontSize}px; }`)
  upsertInlineStyle(STYLE_IDS.lineHeight, `${PARAGRAPH_SELECTOR} { line-height: ${input.lineHeight}; }`)
  upsertInlineStyle(STYLE_IDS.fontWeight, `${READ_BODY_SELECTOR} { font-weight: ${input.fontWeight}; }`)
}

/** 移除段落样式 <style>。对齐 Vue removeReaderParagraphStyles。 */
export function removeReaderParagraphStyles(): void {
  Object.values(STYLE_IDS).forEach(removeInlineStyle)
}

export interface ReaderContentStyles {
  /** 挂到 root 的 CSS 变量 + 背景色/文字色 */
  rootStyle: React.CSSProperties
  /** 挂到 body 的 font-size 变量 */
  contentBodyStyle: React.CSSProperties
}

/**
 * 订阅 settings-store，注入段落样式并返回 root/body 样式对象。
 * fontSize/spacing/fontWeight 变化时同步 upsert <style>（Vue watch 行为）。
 */
export function useContentStyles(): ReaderContentStyles {
  const theme = useSettingsStore((s) => s.theme)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const spacing = useSettingsStore((s) => s.spacing)
  const fontWeight = useSettingsStore((s) => s.fontWeight)

  useEffect(() => {
    applyReaderParagraphStyles({
      fontSize: Number(fontSize) || 16,
      lineHeight: resolveLineHeight(spacing),
      fontWeight: resolveFontWeight(fontWeight)
    })
    return () => {
      removeReaderParagraphStyles()
    }
  }, [fontSize, spacing, fontWeight])

  return useMemo(() => {
    const palette = THEME_MAP[theme] || THEME_MAP.white
    const isDark = theme === 'dark'
    return {
      rootStyle: {
        '--reader-bg': palette.bg,
        '--reader-color': palette.color,
        '--reader-muted': palette.muted,
        '--reader-surface': palette.surface,
        '--reader-surface-raised': palette.surfaceRaised,
        '--reader-surface-muted': palette.surfaceMuted,
        '--reader-border': palette.border,
        '--reader-accent': palette.accent,
        '--reader-accent-soft': palette.accentSoft,
        '--reader-accent-contrast': palette.accentContrast,
        '--reader-shadow': palette.shadow,
        '--reader-overlay': palette.overlay,
        '--reader-image-preview-bg': palette.surfaceRaised,
        '--reader-font-size': `${fontSize}px`,
        '--reader-font-weight': resolveFontWeight(fontWeight),
        '--reader-line-height': resolveLineHeight(spacing),
        '--reader-chapter-btn-bg': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        '--reader-chapter-btn-color': palette.accent,
        backgroundColor: palette.bg,
        color: palette.color,
        transition: 'background-color 0.24s ease, color 0.24s ease'
      } as React.CSSProperties,
      contentBodyStyle: {
        '--reader-font-size': `${fontSize}px`,
        fontSize: `${fontSize}px`
      } as React.CSSProperties
    }
  }, [theme, fontSize, spacing, fontWeight])
}
