/** 章节访问码解析 — 对齐 packages/reader/src/core/chapter-access.ts */

const CODE_OK = 0
const CODE_NEED_LOGIN = 10003
const CODE_NEED_PURCHASE = 10004

export interface NextChapterAccessResult {
  ok: boolean
  needLogin: boolean
  needPurchase: boolean
}

export interface CheckReadAccessResult {
  ok: boolean
  needLogin: boolean
  canRead: boolean
  isLoggedIn?: boolean
}

export function parseNextChapterAccess(res: {
  code?: number
  html?: string
  body?: { html?: string }
} | null | undefined): NextChapterAccessResult {
  const code = Number(res?.code)
  if (code === CODE_NEED_LOGIN) {
    return { ok: false, needLogin: true, needPurchase: false }
  }
  if (code === CODE_NEED_PURCHASE) {
    return { ok: false, needLogin: false, needPurchase: true }
  }
  if (code === CODE_OK && (res?.html || res?.body?.html)) {
    return { ok: true, needLogin: false, needPurchase: false }
  }
  return { ok: false, needLogin: false, needPurchase: false }
}

export function parseCheckReadAccess(res: {
  code?: number
  body?: {
    allFree?: boolean | number
    isFree?: boolean | number
    isLogin?: boolean | number
  }
} | null | undefined): CheckReadAccessResult {
  if (!res || Number(res.code) !== CODE_OK || !res.body) {
    return { ok: false, needLogin: false, canRead: false }
  }

  const { allFree, isFree, isLogin } = res.body
  const isLoggedIn = Boolean(isLogin)
  const chapterFree = Boolean(allFree) || Boolean(isFree)

  if (chapterFree) {
    return { ok: true, needLogin: false, canRead: true, isLoggedIn }
  }

  if (!isLoggedIn) {
    return { ok: false, needLogin: true, canRead: false, isLoggedIn }
  }

  return { ok: true, needLogin: false, canRead: true, isLoggedIn }
}
