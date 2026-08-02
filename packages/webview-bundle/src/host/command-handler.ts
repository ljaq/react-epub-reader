/**
 * App → WebView 命令处理器
 */
import { createEpubAdapter, type EpubAdapter } from '@react-epub-reader/epub-adapter'
import type { Dispatch, SetStateAction } from 'react'
import type { BridgeMessage } from '../bridge/protocol'
import {
  INBOUND_TYPES,
  type EpubChunkPayload,
  type LoadEpubPayload,
  type NavigateThoughtsPayload,
  type SignalAnnotationFailurePayload,
  type UpdateBookmarksPayload,
  type UpdateLinesPayload,
  type UpdateNotesPayload,
} from '../bridge/protocol'
import { emit } from '../bridge/dispatch'
import {
  applyUpdateBookmarks,
  applyUpdateLines,
  applyUpdateNotes,
  buildChapterAccess,
  createEmptyHostState,
  signalAnnotationFailure,
  type WebViewHostState,
} from './webview-host-store'
import type {
  ChapterContent,
  ChapterLoadState,
  ReaderUser,
  TtsAudioEntry,
  TtsVoiceType,
} from '@react-epub-reader/reader'

export interface CommandContext {
  setState: Dispatch<SetStateAction<WebViewHostState>>
  getState: () => WebViewHostState
  adapterRef: { current: EpubAdapter | null }
  epubChunkBuffer: { current: Map<number, string[]> }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const normalized = base64.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function resolveEpubInput(source: LoadEpubPayload['source']): string | ArrayBuffer {
  if (source.kind === 'url') return source.data
  return base64ToArrayBuffer(source.data)
}

const DEFAULT_TTS_VOICES: TtsVoiceType[] = [
  { key: 'BV102_streaming', label: '儒雅青年' },
  { key: 'BV104_streaming', label: '温柔女声' },
]

async function bootstrapEpub(
  ctx: CommandContext,
  payload: LoadEpubPayload,
  input: string | ArrayBuffer,
): Promise<void> {
  const { setState, adapterRef } = ctx

  setState(() => ({
    ...createEmptyHostState(payload.bookId),
    loading: true,
    bootstrapError: null,
  }))

  adapterRef.current?.destroy?.()
  const adapter = createEpubAdapter()
  adapterRef.current = adapter

  try {
    const chapterList = await adapter.loadEpub(input)
    const meta = adapter.getBookMeta()
    const ids = chapterList.map((c) => c.id)
    const initialChapterId = payload.initialChapterId ?? chapterList[0]?.id

    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const content = await adapter.getChapterContent(id)
          return [id, content] as const
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[webview-bundle] chapter load failed', id, error)
          return [id, undefined] as const
        }
      }),
    )

    const chapters: Record<number, ChapterContent> = {}
    const chapterLoadStates: Record<number, ChapterLoadState> = {}
    entries.forEach(([id, content]) => {
      if (content?.html) {
        chapters[id] = content
        chapterLoadStates[id] = 'ready'
      } else {
        chapterLoadStates[id] = 'error'
      }
    })

    if (initialChapterId != null && !chapters[initialChapterId]) {
      throw new Error(`首章 ${initialChapterId} 加载失败`)
    }

    setState({
      bookId: payload.bookId,
      loading: false,
      ready: true,
      bootstrapError: null,
      chapterList,
      chapters,
      chapterAccess: buildChapterAccess(ids),
      chapterLoadStates,
      lines: {},
      notes: {},
      bookmarks: {},
      bookMeta: {
        bookId: payload.bookId,
        bookName: meta?.bookName || 'EPUB',
        author: meta?.author || '佚名',
        bookPic: meta?.bookPic || '',
        allowTts: true,
      },
      user: { isLoggedIn: true, inBookshelf: false },
      ttsVoiceTypes: payload.ttsVoiceTypes ?? DEFAULT_TTS_VOICES,
      ttsAudioUrl: null,
      initialChapterId,
      initialPosition: payload.initialPosition,
      annotationFailure: null,
    })

    emit('epubLoaded', {
      bookId: payload.bookId,
      bookMeta: {
        bookId: payload.bookId,
        bookName: meta?.bookName || 'EPUB',
        author: meta?.author || '佚名',
        bookPic: meta?.bookPic || '',
        allowTts: true,
      },
      chapterList,
    })
  } catch (error) {
    adapterRef.current?.destroy?.()
    adapterRef.current = null
    const message = error instanceof Error ? error.message : String(error)
    setState((s) => ({
      ...s,
      loading: false,
      ready: false,
      bootstrapError: message,
    }))
    emit('error', { scope: 'loadEpub', message })
  }
}

async function handleLoadEpub(ctx: CommandContext, payload: LoadEpubPayload): Promise<void> {
  const input = resolveEpubInput(payload.source)
  await bootstrapEpub(ctx, payload, input)
}

async function handleEpubChunk(ctx: CommandContext, payload: EpubChunkPayload): Promise<void> {
  const { epubChunkBuffer } = ctx
  const { bookId, chunkIndex, totalChunks, data, loadOptions } = payload

  if (!epubChunkBuffer.current.has(bookId)) {
    epubChunkBuffer.current.set(bookId, new Array(totalChunks).fill(''))
  }

  const chunks = epubChunkBuffer.current.get(bookId)!
  chunks[chunkIndex] = data

  if (chunks.some((c) => !c)) return

  const base64 = chunks.join('')
  epubChunkBuffer.current.delete(bookId)

  if (!loadOptions) {
    emit('error', { scope: 'epubChunk', message: 'Missing loadOptions on final chunk' })
    return
  }

  await bootstrapEpub(
    ctx,
    { ...loadOptions, bookId, source: { kind: 'base64', data: base64 } },
    base64ToArrayBuffer(base64),
  )
}

function handleUpdateLines(ctx: CommandContext, payload: UpdateLinesPayload): void {
  const merge = payload.merge ?? true
  ctx.setState((s) => applyUpdateLines(s, payload.chapterId, payload.lines, merge))
}

function handleUpdateNotes(ctx: CommandContext, payload: UpdateNotesPayload): void {
  const merge = payload.merge ?? true
  ctx.setState((s) => applyUpdateNotes(s, payload.chapterId, payload.notes, merge))
}

function handleUpdateBookmarks(ctx: CommandContext, payload: UpdateBookmarksPayload): void {
  const merge = payload.merge ?? true
  ctx.setState((s) =>
    applyUpdateBookmarks(s, payload.chapterId, payload.bookmarks, merge),
  )
}

function handleUpdateUser(ctx: CommandContext, user: ReaderUser): void {
  ctx.setState((s) => ({ ...s, user }))
}

function handleUpdateTtsVoiceTypes(ctx: CommandContext, voiceTypes: TtsVoiceType[]): void {
  ctx.setState((s) => ({ ...s, ttsVoiceTypes: voiceTypes }))
}

function handleInjectTtsAudio(ctx: CommandContext, entry: TtsAudioEntry): void {
  ctx.setState((s) => ({ ...s, ttsAudioUrl: entry }))
}

function handleSignalAnnotationFailure(
  ctx: CommandContext,
  payload: SignalAnnotationFailurePayload,
): void {
  ctx.setState((s) => signalAnnotationFailure(s, payload))
}

function handleNavigateThoughts(_ctx: CommandContext, payload: NavigateThoughtsPayload): void {
  // Phase 1：随感 UI 由 App 侧实现，WebView 仅记录 screen 切换事件
  emit('navigate', { path: `/thoughts/${payload.screen}` })
}

function handleDestroy(ctx: CommandContext): void {
  ctx.adapterRef.current?.destroy?.()
  ctx.adapterRef.current = null
  ctx.epubChunkBuffer.current.clear()
  ctx.setState(createEmptyHostState())
}

export async function handleBridgeCommand(
  msg: BridgeMessage,
  ctx: CommandContext,
): Promise<void> {
  switch (msg.type) {
    case INBOUND_TYPES.loadEpub:
      await handleLoadEpub(ctx, msg.payload as LoadEpubPayload)
      break
    case INBOUND_TYPES.epubChunk:
      await handleEpubChunk(ctx, msg.payload as EpubChunkPayload)
      break
    case INBOUND_TYPES.updateLines:
      handleUpdateLines(ctx, msg.payload as UpdateLinesPayload)
      break
    case INBOUND_TYPES.updateNotes:
      handleUpdateNotes(ctx, msg.payload as UpdateNotesPayload)
      break
    case INBOUND_TYPES.updateBookmarks:
      handleUpdateBookmarks(ctx, msg.payload as UpdateBookmarksPayload)
      break
    case INBOUND_TYPES.updateUser:
      handleUpdateUser(ctx, msg.payload as ReaderUser)
      break
    case INBOUND_TYPES.updateTtsVoiceTypes:
      handleUpdateTtsVoiceTypes(ctx, msg.payload as TtsVoiceType[])
      break
    case INBOUND_TYPES.injectTtsAudio:
      handleInjectTtsAudio(ctx, msg.payload as TtsAudioEntry)
      break
    case INBOUND_TYPES.signalAnnotationFailure:
      handleSignalAnnotationFailure(ctx, msg.payload as SignalAnnotationFailurePayload)
      break
    case INBOUND_TYPES.navigateThoughts:
      handleNavigateThoughts(ctx, msg.payload as NavigateThoughtsPayload)
      break
    case INBOUND_TYPES.destroy:
      handleDestroy(ctx)
      break
    default:
      emit('error', { scope: 'bridge', message: `Unknown command: ${msg.type}` })
  }
}

export async function fetchChapterContent(
  ctx: CommandContext,
  chapterId: number,
): Promise<void> {
  const adapter = ctx.adapterRef.current
  if (!adapter) return

  ctx.setState((s) => {
    if (s.chapters[chapterId]?.html || s.chapterLoadStates[chapterId] === 'loading') {
      return s
    }
    return {
      ...s,
      chapterLoadStates: { ...s.chapterLoadStates, [chapterId]: 'loading' },
    }
  })

  try {
    const content = await adapter.getChapterContent(chapterId)
    ctx.setState((s) => ({
      ...s,
      chapters: { ...s.chapters, [chapterId]: content },
      chapterLoadStates: { ...s.chapterLoadStates, [chapterId]: 'ready' },
    }))
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[webview-bundle] fetch chapter failed', chapterId, error)
    ctx.setState((s) => ({
      ...s,
      chapterLoadStates: { ...s.chapterLoadStates, [chapterId]: 'error' },
    }))
  }
}
