import { describe, it, expect } from 'vitest'
import { parseCheckReadAccess, parseNextChapterAccess } from '../chapter-access'

describe('chapter-access 10003/10004', () => {
  it('parseNextChapterAccess 10003 needLogin', () => {
    expect(parseNextChapterAccess({ code: 10003 })).toEqual({ ok: false, needLogin: true, needPurchase: false })
  })
  it('parseNextChapterAccess 10004 needPurchase', () => {
    expect(parseNextChapterAccess({ code: 10004 })).toEqual({ ok: false, needLogin: false, needPurchase: true })
  })
  it('parseNextChapterAccess code=0 + html → ok', () => {
    expect(parseNextChapterAccess({ code: 0, html: '<p>x</p>' })).toEqual({
      ok: true,
      needLogin: false,
      needPurchase: false
    })
    expect(parseNextChapterAccess({ code: 0, body: { html: '<p>x</p>' } }).ok).toBe(true)
  })
  it('parseNextChapterAccess 其他 → 不 ok', () => {
    expect(parseNextChapterAccess({ code: 1 }).ok).toBe(false)
    expect(parseNextChapterAccess({ code: 0 }).ok).toBe(false)
  })

  it('parseCheckReadAccess 免费章', () => {
    expect(parseCheckReadAccess({ code: 0, body: { allFree: true, isLogin: false } })).toEqual({
      ok: true,
      needLogin: false,
      canRead: true,
      isLoggedIn: false
    })
  })
  it('parseCheckReadAccess 付费未登录 → needLogin', () => {
    expect(parseCheckReadAccess({ code: 0, body: { isLogin: false } })).toEqual({
      ok: false,
      needLogin: true,
      canRead: false,
      isLoggedIn: false
    })
  })
  it('parseCheckReadAccess 付费已登录 → canRead', () => {
    expect(parseCheckReadAccess({ code: 0, body: { isLogin: true } })).toEqual({
      ok: true,
      needLogin: false,
      canRead: true,
      isLoggedIn: true
    })
  })
  it('parseCheckReadAccess 非 0 → 不 ok', () => {
    expect(parseCheckReadAccess({ code: 10003, body: {} }).ok).toBe(false)
    expect(parseCheckReadAccess(null).ok).toBe(false)
  })
})
