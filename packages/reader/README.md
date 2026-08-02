# @react-epub-reader/reader

数据无状态、UI 状态内聚的 React 19 阅读器库。契约详见仓库根目录 [`plans/00-总览与契约.md`](../../plans/00-总览与契约.md)。

宿主集成总览见根目录 [`README.md`](../../README.md)。

## 快速使用

```tsx
import { Reader, type ReaderProps, type ReaderChromeSlots } from '@react-epub-reader/reader'
import '@react-epub-reader/reader/dist/reader.css'

<Reader
  bookId={bookId}
  chapterList={chapterList}
  chapters={chapters}
  chapterAccess={chapterAccess}
  chapterLoadStates={chapterLoadStates}
  lines={lines}
  notes={notes}
  bookmarks={bookmarks}
  bookMeta={bookMeta}
  user={user}
  navigate={(path) => navigate(path)}
  onChapterChange={(chapterId, width) => loadChapter(chapterId, width)}
  onLinkClick={(href) => window.open(href, '_blank')}
/>
```

## chromeSlots 插槽锚点

| 锚点 | 用途 |
|---|---|
| `topBarLeft` | 顶栏左侧扩展 |
| `topBarRight` | 顶栏右侧扩展 |
| `topBarMoreMenu` | 顶栏「更多」菜单项（如随感入口） |
| `toolbarExtra` | 底栏工具栏扩展 |
| `contentOverlay` | 正文区域 overlay |
| `bottomExtension` | 底栏下方扩展 |
| `rootOverlay` | 根节点 overlay |

插槽函数签名：`(ctx: ReaderSlotCtx) => ReactNode`

```ts
interface ReaderSlotCtx {
  bookId: number
  chapterId: number
  navigate: (path: string) => void  // 宿主注入
}
```

### 随感注入示例（仅宿主侧）

随感业务**不在 reader 包内**。参考 `apps/h5-demo/src/slots/thoughts-menu.tsx`：

```tsx
export function createThoughtsMenuSlot(): ReaderChromeSlots {
  return {
    topBarMoreMenu: (ctx) => (
      <button
        type="button"
        className="reader-top-bar__menu-item"
        onClick={() => ctx.navigate(`/book/${ctx.bookId}/thoughts`)}
      >
        随感
      </button>
    ),
  }
}

// ReaderHost
<Reader chromeSlots={createThoughtsMenuSlot()} navigate={navigate} ... />
```

完整随感 UI 见 `apps/h5-demo/src/routes/thoughts/`。

## 乐观 UI 时序

标注类操作（划线 / 批注 / 书签）采用「先改 DOM，再通知宿主」：

```
用户确认划线
  ├─ ① wrapLineMark(DOM) + pending 写入 annotation-store
  ├─ ② onLineCreate({ clientId: webLineId, ... })  fire-and-forget
  └─ ③ 宿主调 API
        ├─ 成功 → props 回写 lines，带 clientId 一个周期 → reconcile 清 pending
        └─ 失败 → props 注入 annotationFailure（nonce++）
              → reader unwrap DOM + 清 pending + Toast
              → 可选 onAnnotationError
```

失败分支（宿主 → reader）：

```tsx
// 宿主 API catch 后
setAnnotationFailure({
  clientId: payload.webLineId,
  type: 'line',
  chapterId: payload.chapterId,
  nonce: failureNonceRef.current++
})

<Reader annotationFailure={annotationFailure} ... />
```

Bookmark 无 clientId，按 `id` 匹配；失败时 `type: 'bookmark'` 走 `removePendingBookmark`。

## 首屏 Loading（横划）

横划模式首屏会显示全屏 loading（对齐 Vue）：分页测量 + `initialPosition` 无动画还原 + 邻居章 buffer 合并完成后，遮罩 **opacity 淡出** 再展示正文，避免未列化 HTML 溢出或翻页 transition 闪屏。宿主侧另有 bootstrap loading（见 `ReaderHost`：首章 HTML 就绪后再挂载 `<Reader />`）。

## 边界约束

- 零 `fetch` / 零 `USE_MOCK` / 零 `react-router`
- 零随感等业务代码（随感仅 h5-demo + chromeSlots 注入）
- 书籍 CSS：`bookMeta` 含 `cssLists` / `appendCss` 时自动 `loadBookCss` + 正文 `syncBookCssRules`

## 富媒体交互

正文点击分发（横/竖模式均已接入）：

- 普通图片 → 全屏预览 overlay
- `zhangyue-footnote` 图片 → 脚注 Popover（再次点击关闭）
- `<a href>` → `onLinkClick(href)`（宿主处理跳转）
