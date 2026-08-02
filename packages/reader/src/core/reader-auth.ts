/**
 * 阅读器登录文案常量。
 *
 * 源码对照：old-vue-reader/utils/reader-auth.js:6-13
 *
 * 说明：reader-auth.js 中的 checkLoggedIn / loginConfirm / loginAlert / guardLoggedIn /
 * navigateToReaderLogin 均依赖 @/api/request-helper、store/user、CustomDialog、login-url，
 * 属于 API/UI 层（宿主职责），不在 core 纯函数范围。本模块仅导出冻结的文案常量，
 * 供 Phase 3/4/6 的壳层与拦截逻辑引用。宿主侧的登录拦截由 onLoginRequired 回调驱动
 * （见 plans/00-总览与契约.md §6）。
 */
export const READER_LOGIN_MESSAGES = {
  catalog: '登录后可查看全部内容。',
  bookmark: '登陆后可添加',
  tts: '请先登录!',
  underline: '请先登录!',
  trialFeature: '体验完整阅读功能，请登录!',
  purchase: '该章节为付费章节'
} as const

export type ReaderLoginMessageKey = keyof typeof READER_LOGIN_MESSAGES
