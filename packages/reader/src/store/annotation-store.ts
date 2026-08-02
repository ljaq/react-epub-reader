/**
 * 标注乐观 UI store — pending lines/notes + 选区态 + 批注草稿。
 *
 * 源码对照：old-vue-reader/store/reader-context.js
 * upsertChapterLine:741 / removeChapterLine:752 / upsertChapterNote:760 / removeChapterNote:771
 * setSelection:734 / clearSelection:738
 */
import { create } from 'zustand'
import type { LineItem, NoteItem } from '../types'
import type { HandleRect } from '../core/selection/text-pos-rects'
import type { HighlightPosItem } from '../core/selection/text-pos'
import { DEFAULT_UNDERLINE_COLOR } from '../core/highlights/line'

export interface SelectionRect {
  top: number
  left: number
  width: number
  height: number
  bottom?: number
  right?: number
}

export interface SelectionBoundary {
  x: number
  y: number
  h?: number
}

/** 选区/已有划线气泡展示态（对齐 Vue reader.state.selection） */
export interface SelectionDisplayState {
  mode: 'text' | 'line'
  text: string
  posInfo: Record<string, number>
  domPosBase?: string
  rect: SelectionRect | null
  chapterId: number | null
  highlightPosList?: HighlightPosItem[]
  boundary1?: SelectionBoundary | null
  boundary2?: SelectionBoundary | null
  needUp?: boolean
  handleStart?: HandleRect | null
  handleEnd?: HandleRect | null
  webLineId?: string
  underlineColor?: string
}

export interface AnnotationDraft {
  text: string
  chapterId: number
  posInfo: Record<string, number>
  webLineId?: string
  mode?: 'text' | 'line'
}

export interface ChapterLinesBucket {
  data: Record<string, LineItem>
}

export interface ChapterNotesBucket {
  data: Record<string, NoteItem>
}

interface AnnotationState {
  selection: SelectionDisplayState | null
  preferredLineColor: string
  pendingLines: Record<number, Record<string, LineItem>>
  pendingNotes: Record<number, Record<string, NoteItem>>
  annotationPanelVisible: boolean
  annotationDraft: AnnotationDraft | null
  noteListVisible: boolean
  noteListItems: NoteItem[]

  setSelection: (selection: SelectionDisplayState | null) => void
  clearSelection: () => void
  setPreferredLineColor: (color: string) => void

  addPendingLine: (chapterId: number, item: LineItem) => void
  removePendingLine: (chapterId: number, webLineId: string) => void
  addPendingNote: (chapterId: number, item: NoteItem) => void
  removePendingNote: (chapterId: number, webNoteId: string) => void

  reconcileLines: (lines: Record<number, Record<string, LineItem>>) => void
  reconcileNotes: (notes: Record<number, Record<string, NoteItem>>) => void

  getMergedChapterLines: (
    chapterId: number,
    propsLines: Record<number, Record<string, LineItem>>
  ) => ChapterLinesBucket

  getMergedChapterNotes: (
    chapterId: number,
    propsNotes: Record<number, Record<string, NoteItem>>
  ) => ChapterNotesBucket

  openAnnotationPanel: (draft: AnnotationDraft) => void
  closeAnnotationPanel: () => void
  openNoteList: (items: NoteItem[]) => void
  closeNoteList: () => void
}

function mergeChapterData<T extends { webLineId?: string; webNoteId?: string; clientId?: string }>(
  propsBucket: Record<string, T> | undefined,
  pendingBucket: Record<string, T> | undefined,
  idKey: 'webLineId' | 'webNoteId'
): Record<string, T> {
  const merged: Record<string, T> = { ...(propsBucket || {}) }
  if (!pendingBucket) {
    return merged
  }
  Object.keys(pendingBucket).forEach((id) => {
    const pending = pendingBucket[id]
    const propsMatch = Object.values(merged).find(
      (item) => item.clientId === id || item[idKey] === id
    )
    if (!propsMatch) {
      merged[id] = pending
    }
  })
  return merged
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  selection: null,
  preferredLineColor: DEFAULT_UNDERLINE_COLOR,
  pendingLines: {},
  pendingNotes: {},
  annotationPanelVisible: false,
  annotationDraft: null,
  noteListVisible: false,
  noteListItems: [],

  setSelection: (selection) =>
    set((s) => {
      if (s.selection === selection) return s
      return { selection }
    }),
  clearSelection: () => set({ selection: null }),
  setPreferredLineColor: (color) => set({ preferredLineColor: color }),

  addPendingLine: (chapterId, item) => {
    set((s) => {
      const key = Number(chapterId)
      const bucket = { ...(s.pendingLines[key] || {}) }
      bucket[item.webLineId] = { ...item, clientId: item.webLineId }
      return { pendingLines: { ...s.pendingLines, [key]: bucket } }
    })
  },

  removePendingLine: (chapterId, webLineId) => {
    set((s) => {
      const key = Number(chapterId)
      const bucket = { ...(s.pendingLines[key] || {}) }
      delete bucket[webLineId]
      const next = { ...s.pendingLines }
      if (Object.keys(bucket).length) {
        next[key] = bucket
      } else {
        delete next[key]
      }
      return { pendingLines: next }
    })
  },

  addPendingNote: (chapterId, item) => {
    set((s) => {
      const key = Number(chapterId)
      const bucket = { ...(s.pendingNotes[key] || {}) }
      bucket[item.webNoteId] = { ...item, clientId: item.webNoteId }
      return { pendingNotes: { ...s.pendingNotes, [key]: bucket } }
    })
  },

  removePendingNote: (chapterId, webNoteId) => {
    set((s) => {
      const key = Number(chapterId)
      const bucket = { ...(s.pendingNotes[key] || {}) }
      delete bucket[webNoteId]
      const next = { ...s.pendingNotes }
      if (Object.keys(bucket).length) {
        next[key] = bucket
      } else {
        delete next[key]
      }
      return { pendingNotes: next }
    })
  },

  reconcileLines: (lines) => {
    set((s) => {
      const nextPending = { ...s.pendingLines }
      Object.keys(nextPending).forEach((chapterKey) => {
        const pendingBucket = nextPending[Number(chapterKey)]
        if (!pendingBucket) return
        const propsBucket = lines[Number(chapterKey)] || {}
        Object.keys(pendingBucket).forEach((clientId) => {
          const matched = Object.values(propsBucket).find(
            (item) => item.clientId === clientId || item.webLineId === clientId
          )
          if (matched && matched.id != null) {
            delete pendingBucket[clientId]
          }
        })
        if (!Object.keys(pendingBucket).length) {
          delete nextPending[Number(chapterKey)]
        }
      })
      return { pendingLines: nextPending }
    })
  },

  reconcileNotes: (notes) => {
    set((s) => {
      const nextPending = { ...s.pendingNotes }
      Object.keys(nextPending).forEach((chapterKey) => {
        const pendingBucket = nextPending[Number(chapterKey)]
        if (!pendingBucket) return
        const propsBucket = notes[Number(chapterKey)] || {}
        Object.keys(pendingBucket).forEach((clientId) => {
          const matched = Object.values(propsBucket).find(
            (item) => item.clientId === clientId || item.webNoteId === clientId
          )
          if (matched && matched.id != null) {
            delete pendingBucket[clientId]
          }
        })
        if (!Object.keys(pendingBucket).length) {
          delete nextPending[Number(chapterKey)]
        }
      })
      return { pendingNotes: nextPending }
    })
  },

  getMergedChapterLines: (chapterId, propsLines) => ({
    data: mergeChapterData(
      propsLines[Number(chapterId)],
      get().pendingLines[Number(chapterId)],
      'webLineId'
    )
  }),

  getMergedChapterNotes: (chapterId, propsNotes) => ({
    data: mergeChapterData(
      propsNotes[Number(chapterId)],
      get().pendingNotes[Number(chapterId)],
      'webNoteId'
    )
  }),

  openAnnotationPanel: (draft) =>
    set({ annotationPanelVisible: true, annotationDraft: draft }),
  closeAnnotationPanel: () =>
    set({ annotationPanelVisible: false, annotationDraft: null }),
  openNoteList: (items) => set({ noteListVisible: true, noteListItems: items }),
  closeNoteList: () => set({ noteListVisible: false, noteListItems: [] })
}))
