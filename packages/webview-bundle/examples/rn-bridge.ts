/**
 * React Native WebView 集成参考（无 JSX，可直接复制到 RN 项目）
 *
 * 依赖：react-native-webview
 *
 * 用法：
 * 1. 将 packages/webview-bundle/dist/ 复制到 App 的 assets/webview/
 * 2. 使用 createRnBridge 封装 injectJavaScript / onMessage
 */

import type { RefObject } from 'react'
import type WebView from 'react-native-webview'

// ── 协议类型（与 packages/webview-bundle/src/bridge/protocol.ts 对齐）──

export interface BridgeMessage {
  v: 1
  id?: string
  type: string
  payload?: unknown
}

export interface LoadEpubPayload {
  bookId: number
  source: { kind: 'base64' | 'url'; data: string }
  initialChapterId?: number
  initialPosition?: {
    chapterId: number
    domPos: string
    precent: number
    pageIndex?: number
    globalPageIndex?: number
  }
}

// ── 工具函数 ──

export function createMessage(type: string, payload?: unknown, id?: string): string {
  return JSON.stringify({ v: 1, type, payload, id } satisfies BridgeMessage)
}

export function escapeForInject(json: string): string {
  return json.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function parseBridgeMessage(raw: string): BridgeMessage | null {
  try {
    const msg = JSON.parse(raw) as BridgeMessage
    if (msg.v !== 1 || typeof msg.type !== 'string') return null
    return msg
  } catch {
    return null
  }
}

// ── RN Bridge 封装 ──

export function createRnBridge(webViewRef: RefObject<WebView | null>) {
  return {
    dispatch(type: string, payload?: unknown) {
      const raw = createMessage(type, payload)
      webViewRef.current?.injectJavaScript(
        `window.__EpubReader.dispatch('${escapeForInject(raw)}'); true;`,
      )
    },
    loadEpub(epubUrl: string, bookId = 1) {
      this.dispatch('loadEpub', {
        bookId,
        source: { kind: 'url', data: epubUrl },
      } satisfies LoadEpubPayload)
    },
    loadBook(payload: Record<string, unknown>) {
      this.dispatch('loadBook', payload)
    },
    injectChapter(payload: {
      chapterId: number
      content?: unknown
      access?: unknown
      loadState: 'idle' | 'loading' | 'ready' | 'error'
    }) {
      this.dispatch('injectChapter', payload)
    },
    updateChapterAccess(chapterAccess: Record<string, unknown>, merge = true) {
      this.dispatch('updateChapterAccess', { chapterAccess, merge })
    },
    updateLines(chapterId: number, lines: unknown[], merge = true) {
      this.dispatch('updateLines', { chapterId, lines, merge })
    },
    updateNotes(chapterId: number, notes: unknown[], merge = true) {
      this.dispatch('updateNotes', { chapterId, notes, merge })
    },
    signalAnnotationFailure(
      clientId: string,
      type: 'line' | 'note' | 'bookmark',
      chapterId: number,
    ) {
      this.dispatch('signalAnnotationFailure', { clientId, type, chapterId })
    },
    injectTtsAudio(entry: { reqId: string; url: string; text: string; voiceType: string }) {
      this.dispatch('injectTtsAudio', entry)
    },
    destroy() {
      this.dispatch('destroy')
    },
  }
}

/**
 * RN WebView 集成伪代码：
 *
 * ```tsx
 * import { Platform } from 'react-native'
 * import WebView from 'react-native-webview'
 * import { createRnBridge, parseBridgeMessage } from './rn-bridge'
 *
 * const ref = useRef<WebView>(null)
 * const bridge = createRnBridge(ref)
 *
 * const source = Platform.OS === 'android'
 *   ? { uri: 'file:///android_asset/webview/index.html' }
 *   : { uri: 'file:///webview/index.html' }
 *
 * <WebView
 *   ref={ref}
 *   source={source}
 *   originWhitelist={['*']}
 *   allowFileAccess
 *   onMessage={(e) => {
 *     const msg = parseBridgeMessage(e.nativeEvent.data)
 *     if (msg?.type === 'lineCreate') { ... }
 *   }}
 *   onLoadEnd={() => bridge.loadEpub(epubFileUrl)}
 * />
 * ```
 *
 * API 模式伪代码：
 *
 * ```tsx
 * // bootstrap
 * const [meta, chapterList, lines, notes, bookmarks, position] = await Promise.all([...])
 * const { content, access } = await fetchChapterContent(bookId, initialChapterId, 398)
 * bridge.loadBook({ bookId, bookMeta: meta, chapterList, chapterAccess, chapters: { [id]: content }, ... })
 *
 * // onMessage
 * if (msg?.type === 'chapterChange') {
 *   const { chapterId, width } = msg.payload
 *   bridge.injectChapter({ chapterId, loadState: 'loading' })
 *   const { content, access } = await fetchChapterContent(bookId, chapterId, width)
 *   bridge.injectChapter({ chapterId, content, access, loadState: 'ready' })
 * }
 * ```
 */
