import type { ReaderProps } from '@react-epub-reader/reader'

const para = (text: string): string => `<p>${text}</p>`

const longBody = Array.from({ length: 24 }, (_, i) =>
  para(
    `第 ${i + 1} 段：这是 react-epub-reader Phase 2 阅读引擎的预览示例文本。横划模式下，正文会被 CSS 多列布局切成多页，左右滑动可在章内翻页，点击左 20% 上一页、右 20% 下一页，中央 20%–80% 唤起/隐藏 UI。章末会出现「下一章」按钮。`
  )
).join('')

const shortBody = para('本章内容较短，仅一页。用于测试单页章节的边界行为。')

export const mockReaderProps: ReaderProps = {
  bookId: 12535542,
  initialChapterId: 2,
  chapterList: [
    { id: 1, chapterName: '第一章 引子', wordCount: 1200, tag: '免费', isOrder: true, anchorId: 'ch1', index: 0 },
    { id: 2, chapterName: '第二章 阅读引擎', wordCount: 3600, tag: '免费', isOrder: true, anchorId: 'ch2', index: 1 },
    { id: 3, chapterName: '第三章 短章测试', wordCount: 80, tag: '免费', isOrder: true, anchorId: 'ch3', index: 2 },
    { id: 4, chapterName: '第四章 末章', wordCount: 2000, tag: '付费', isOrder: false, anchorId: 'ch4', index: 3 }
  ],
  chapters: {
    1: { chapterId: 1, chapterName: '第一章 引子', html: para('引子：故事从这里开始。') + longBody, hasNext: true, pageButton: '' },
    2: { chapterId: 2, chapterName: '第二章 阅读引擎', html: `<h2>第二章 阅读引擎</h2>` + longBody + longBody, hasNext: true, pageButton: '' },
    3: { chapterId: 3, chapterName: '第三章 短章测试', html: shortBody, hasNext: true, pageButton: '' },
    4: { chapterId: 4, chapterName: '第四章 末章', html: para('这是最后一章，hasNext=false，章末按钮应置灰。') + longBody, hasNext: false, pageButton: '' }
  },
  chapterAccess: {
    1: { chapterId: 1, canRead: true, needLogin: false, needPurchase: false, isLoggedIn: false },
    2: { chapterId: 2, canRead: true, needLogin: false, needPurchase: false, isLoggedIn: false },
    3: { chapterId: 3, canRead: true, needLogin: false, needPurchase: false, isLoggedIn: false },
    4: { chapterId: 4, canRead: true, needLogin: false, needPurchase: false, isLoggedIn: false }
  },
  chapterLoadStates: {
    1: 'ready', 2: 'ready', 3: 'ready', 4: 'ready'
  },
  lines: {},
  notes: {},
  bookmarks: {},
  bookMeta: { bookId: 12535542, bookName: '示例书籍', author: '佚名', bookPic: '' },
  user: { isLoggedIn: false, inBookshelf: false },
  ttsVoiceTypes: [
    { key: 'BV102_streaming', label: '儒雅青年' },
    { key: 'BV104_streaming', label: '温柔女声' },
    { key: 'BV123_streaming', label: '阳光青年' }
  ]
}
