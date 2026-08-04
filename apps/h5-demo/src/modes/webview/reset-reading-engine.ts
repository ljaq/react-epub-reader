import { useReadingStore } from '@react-epub-reader/reader'

/** 切换演示模式时重置 reader 全局 zustand，避免 H5 残留 buffer/boot 状态卡住 WebView 首屏 */
export function resetReadingEngine(): void {
  useReadingStore.setState({
    chapterId: 0,
    pageIndex: 0,
    pageCount: 1,
    globalPageIndex: 0,
    dragOffset: 0,
    isRebalancing: false,
    layoutLocked: false,
    isFlipping: false,
    pageWidth: 0,
    pageStride: 0,
    measuredContentWidth: 0,
    buffer: {
      order: [],
      segments: {},
      totalPages: 1,
      totalWidthPx: 0,
      loading: false,
      silentExpand: false,
    },
    bufferReady: false,
    initialLayoutSettled: false,
    bootContentReady: false,
    neighborPreloadStarted: false,
    navTarget: null,
  })
}
