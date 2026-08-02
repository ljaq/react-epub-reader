# react-epub-reader

将 Vue 2 H5 阅读器 1:1 复刻为 **React 19 + TypeScript** monorepo：数据由宿主 Props 驱动，阅读器 UI 状态内聚，可独立发布为 npm 包或嵌入自有 H5/App WebView。

完整契约与迁移记录见 [`plans/00-总览与契约.md`](plans/00-总览与契约.md)、进度见 [`plans/STATUS.md`](plans/STATUS.md)。

---

## 功能概览

| 能力 | 说明 |
|---|---|
| 双模式阅读 | 横划翻页 / 竖滚单章，设置持久化（`localStorage: h5-reader-settings`） |
| 目录 / 设置 / 字体 | 主题、亮度、行距、字号 6 档、字重 3 档、护眼模式 |
| 划线 / 批注 / 书签 | 乐观 UI + `clientId` reconcile；失败经 `annotationFailure` 回滚 |
| 笔记中心 | 三 Tab（划线 / 批注 / 书签），列表跳转定位 |
| 阅读进度 | debounce 800ms + 30s 定时上报；`initialPosition` 还原 |
| TTS 语音朗读 | `onTtsAudioRequest` → 宿主取音频 → `ttsAudioUrl` 注入 |
| 富媒体 | 图片预览、脚注 Popover、正文链接 `onLinkClick` |
| 书籍 CSS | 宿主 `bookMeta` 含外部 CSS 时自动注入与同步 |
| EPUB | `@react-epub-reader/epub-adapter` 解析 spine → 统一章节契约 |
| 业务插槽 | 随感等通过 `chromeSlots` 注入，reader 包零内置业务 |

---

## 包结构

```
react-epub-reader/
├── packages/reader/          # 阅读器库（零 fetch / 零路由 / 零 USE_MOCK）
├── packages/epub-adapter/    # epub.js → ChapterMeta / ChapterContent
├── apps/h5-demo/             # 集成示例：Mock API、ReaderHost、随感、EPUB 调试
└── plans/                    # 契约、Phase 计划、验收看板
```

| 包 | npm name | 职责 |
|---|---|---|
| `packages/reader` | `@react-epub-reader/reader` | `<Reader />` 组件 + 全部阅读能力 |
| `packages/epub-adapter` | `@react-epub-reader/epub-adapter` | EPUB 加载、章节 HTML、资源 rewrite |
| `apps/h5-demo` | `@react-epub-reader/h5-demo` | 宿主参考实现：API、路由、ReaderHost |

---

## 设计理念

- **数据无状态**：章节、标注、用户态由宿主 Props 注入；reader 不发起网络请求。
- **UI 状态内聚**：选区、翻页、主题、弹窗、TTS 会话等在 reader 内部 store 管理。
- **乐观 UI**：划线/批注先改 DOM 并写 pending，宿主 API 成功后再 reconcile；失败走 `annotationFailure`。
- **业务可插拔**：随感、详情页跳转等只在 `apps/h5-demo`；reader 通过 `chromeSlots` + `navigate` 扩展。

---

## 环境要求

- **Node.js 22+**（见根目录 `.nvmrc`）
- **pnpm**（workspace monorepo）

```bash
nvm use
pnpm install
```

---

## 本地运行（h5-demo）

```bash
pnpm dev
```

浏览器打开后默认进入示例书阅读页：

**http://localhost:5173/book/12535542/read**

### 路由

| 路径 | 说明 |
|---|---|
| `/` | 重定向到 `/book/12535542/read` |
| `/book/:id/read` | Mock API 阅读页（`ReaderHost` 桥接） |
| `/book/:id/thoughts` | 随感列表 |
| `/book/:id/thoughts/write` | 写随感 |
| `/dev/epub` | EPUB 调试页（独立路由） |

### DevPanel（仅开发环境）

右上角 DevPanel 可切换：

| 选项 | 说明 |
|---|---|
| Mock API（路由） | 默认；走内存 Mock + 完整 API 链路 |
| EPUB（sample.epub） | 使用 `public/sample.epub`，不经过 Mock API |
| EPUB（本地文件） | 选择本地 `.epub` 文件 |
| USE_MOCK | 展示态；实际需 `VITE_USE_MOCK=false` 并**刷新**后走真实 HTTP |
| 划线/批注/书签失败 | 模拟下次 API 失败，验证 rollback |

Mock 示例书 **第二章** 含富媒体（图片 / 脚注 / 外链），适合 smoke 测试。

### 环境变量

在 `apps/h5-demo` 下创建 `.env`（可选）：

```bash
# 默认 true；设为 false 后刷新页面，API 走真实 HTTP（需配置后端）
VITE_USE_MOCK=false
```

Mock 公共参数（与 Vue 一致）：`rentId=105883`、`appId=13673ce1`（见 `apps/h5-demo/src/api/request-helper.ts`）。

---

## 构建与测试

```bash
pnpm -r run build    # 三包构建
pnpm -w test         # 162 项单测（reader + epub-adapter）
pnpm lint            # oxlint
pnpm preview         # 预览 h5-demo 生产构建
```

---

## 集成到自己的宿主

### 1. 依赖阅读器包

```tsx
import { Reader, type ReaderProps } from '@react-epub-reader/reader'
import '@react-epub-reader/reader/dist/reader.css'
```

### 2. 注入 Props + 回调

宿主负责：**拉书元数据 / 章列表 / 章 HTML / 标注 / 进度 / TTS 音频**，通过 Props 传入；阅读器通过回调通知 **切章、预取、标注 CRUD、进度上报、登录拦截** 等。

最小示例：

```tsx
<Reader
  bookId={bookId}
  initialChapterId={2}
  initialPosition={savedSnapshot}
  chapterList={chapterList}
  chapters={chaptersMap}
  chapterAccess={chapterAccess}
  chapterLoadStates={chapterLoadStates}
  lines={lines}
  notes={notes}
  bookmarks={bookmarks}
  bookMeta={bookMeta}
  user={{ isLoggedIn: true, inBookshelf: false }}
  ttsVoiceTypes={voiceTypes}
  ttsAudioUrl={ttsAudioUrl}
  navigate={(path) => router.push(path)}
  onChapterChange={(chapterId, width) => fetchChapter(chapterId, width)}
  onPrefetch={(ids, width) => prefetchChapters(ids, width)}
  onLineCreate={handleLineCreate}
  onReadingPositionChange={savePosition}
  onTtsAudioRequest={fetchAndInjectTts}
  onLinkClick={(href) => window.open(href, '_blank')}
  annotationFailure={failureSignal}
/>
```

完整 Props / 回调表见 [`plans/00-总览与契约.md`](plans/00-总览与契约.md) §5–§6。

### 3. 参考实现

| 文件 | 作用 |
|---|---|
| [`apps/h5-demo/src/host/ReaderHost.tsx`](apps/h5-demo/src/host/ReaderHost.tsx) | bootstrap、懒加载 ±1 章、标注 reconcile、TTS、首屏 loading |
| [`apps/h5-demo/src/host/host-store.ts`](apps/h5-demo/src/host/host-store.ts) | 宿主数据态 |
| [`apps/h5-demo/src/api/*`](apps/h5-demo/src/api/) | Mock / 真实 API 模块 |
| [`apps/h5-demo/src/slots/thoughts-menu.tsx`](apps/h5-demo/src/slots/thoughts-menu.tsx) | 随感插槽示例 |

更细的插槽用法、乐观 UI 时序见 [`packages/reader/README.md`](packages/reader/README.md)。

### 4. EPUB 数据源

```tsx
import { createEpubAdapter } from '@react-epub-reader/epub-adapter'

const adapter = createEpubAdapter()
const chapterList = await adapter.loadEpub(fileOrUrl)
const content = await adapter.getChapterContent(chapterId)
// 将 content 填入 ReaderProps.chapters[chapterId]
```

参考 [`apps/h5-demo/src/epub-host.tsx`](apps/h5-demo/src/epub-host.tsx)。

---

## 插槽示例（随感入口）

```tsx
<Reader
  chromeSlots={{
    topBarMoreMenu: (ctx) => (
      <button
        type="button"
        className="reader-top-bar__menu-item"
        onClick={() => ctx.navigate(`/book/${ctx.bookId}/thoughts`)}
      >
        随感
      </button>
    ),
  }}
  navigate={navigate}
  {...otherProps}
/>
```

---

## 契约要点（摘要）

| 主题 | 约定 |
|---|---|
| 标注 reconcile | 划线/批注用 `clientId`（= webLineId/webNoteId）；书签用 `id` |
| API 失败 | 宿主注入 `annotationFailure`（`nonce` 递增）→ DOM 回滚 + Toast |
| TTS | fire-and-forget `onTtsAudioRequest`；宿主用 `ttsAudioUrl` 按 `reqId` 注入 |
| 切章宽度 | `onChapterChange(chapterId, width)`，`width` 为容器实测（默认 398） |
| reader 边界 | 包内禁止 `fetch`、`USE_MOCK`、`react-router` |

---

## 开发计划

- [x] Phase 0 — monorepo 基建
- [x] Phase 1 — core 纯函数引擎 + 单测
- [x] Phase 2 — 双模式阅读引擎
- [x] Phase 3 — 壳层 / 设置 / 目录 / 插槽
- [x] Phase 4 — 选中 / 划线 / 批注 + 乐观 UI
- [x] Phase 5 — 笔记中心 / 书签 / 进度
- [x] Phase 6 — TTS
- [x] Phase 7 — Epub Adapter
- [x] Phase 8 — H5 宿主 API + ReaderHost
- [x] Phase 9 — 富媒体 / 书 CSS / 随感 / 文档

**迁移主链路已闭环。** 可选后续：EPUB 标注 CFI、Playwright 视觉回归、`BookMeta.cssLists` 契约化、reader bundle code-split。

---

## 相关文档

- [总览与契约](plans/00-总览与契约.md)
- [迁移状态看板](plans/STATUS.md)
- [阅读器库文档](packages/reader/README.md)
- [Plans 工作流](plans/README.md)
