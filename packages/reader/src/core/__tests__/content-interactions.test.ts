import { describe, expect, it } from 'vitest'
import {
  isFootnoteImage,
  isPreviewableImage,
  resolveAnchorRect,
  resolveContentLink,
  resolveFootnoteText,
  resolvePreviewImageUrl
} from '../content-interactions'

describe('content-interactions', () => {
  it('isFootnoteImage 识别脚注图', () => {
    const img = document.createElement('img')
    img.className = 'zhangyue-footnote'
    expect(isFootnoteImage(img)).toBe(true)
    expect(isPreviewableImage(img)).toBe(false)
  })

  it('isPreviewableImage 普通有 src 图片', () => {
    const img = document.createElement('img')
    img.src = 'https://example.com/a.png'
    expect(isPreviewableImage(img)).toBe(true)
  })

  it('resolveFootnoteText / resolvePreviewImageUrl', () => {
    const foot = document.createElement('img')
    foot.setAttribute('zy-footnote', '脚注内容')
    expect(resolveFootnoteText(foot)).toBe('脚注内容')

    const img = document.createElement('img')
    img.src = 'https://example.com/b.png'
    expect(resolvePreviewImageUrl(img)).toBe('https://example.com/b.png')
  })

  it('resolveAnchorRect', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const rect = resolveAnchorRect(el)
    expect(rect).not.toBeNull()
    expect(typeof rect!.width).toBe('number')
    document.body.removeChild(el)
  })

  it('resolveContentLink 排除章导航', () => {
    const root = document.createElement('div')
    root.innerHTML = '<a href="https://a.com">link</a>'
    const link = resolveContentLink(root.querySelector('a'))
    expect(link?.href).toContain('https://a.com')

    const nav = document.createElement('button')
    nav.className = 'reader-chapter-btn'
    nav.innerHTML = '<a href="https://b.com">nav</a>'
    expect(resolveContentLink(nav.querySelector('a'))).toBeNull()
  })
})
