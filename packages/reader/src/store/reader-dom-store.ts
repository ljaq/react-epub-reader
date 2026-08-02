/**
 * 正文 DOM 桥接 store — ReaderContent 注册，TopBar/Reporter/NavTarget 读取。
 *
 * 避免 ReaderChrome 与 ReaderContent 之间 props 深传。
 */
import { create } from 'zustand'

interface ReaderDomState {
  bodyMap: Map<number, Element>
  scrollRoot: HTMLElement | null
  viewportEl: HTMLElement | null

  registerBody: (chapterId: number, el: Element | null) => void
  registerScrollRoot: (el: HTMLElement | null) => void
  registerViewport: (el: HTMLElement | null) => void
  getBodyForChapter: (chapterId: number) => Element | null
  getScrollRoot: () => HTMLElement | null
  getViewportEl: () => HTMLElement | null
}

export const useReaderDomStore = create<ReaderDomState>((set, get) => ({
  bodyMap: new Map(),
  scrollRoot: null,
  viewportEl: null,

  registerBody: (chapterId, el) => {
    const next = new Map(get().bodyMap)
    const id = Number(chapterId)
    if (el) next.set(id, el)
    else next.delete(id)
    set({ bodyMap: next })
  },

  registerScrollRoot: (el) => set({ scrollRoot: el }),
  registerViewport: (el) => set({ viewportEl: el }),

  getBodyForChapter: (chapterId) => get().bodyMap.get(Number(chapterId)) ?? null,
  getScrollRoot: () => get().scrollRoot,
  getViewportEl: () => get().viewportEl
}))
