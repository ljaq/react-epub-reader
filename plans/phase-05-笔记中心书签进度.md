# Phase 5 — 笔记中心 + 书签 + 进度 + 试读（子 Agent E）

> 执行者：子 Agent E。前置：Phase 4 done（依赖 annotation-store）。产出笔记中心、书签、阅读进度上报、试读提示。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§4 BookmarkItem/ReadingSnapshot、§6 onBookmark*/onReadingPositionChange/onLoginRequired）
3. old-vue-reader/components/{NotesPopup,ReadLoginTip}/
4. old-vue-reader/utils/{bookmark-match,reading-position-report}.js
5. old-vue-reader/prd/cursor-plan/09-笔记中心书签.md
6. old-vue-reader/prd/design/ 打开笔记.png、试读结束提示.png

## 任务清单

### 1. popups/NotesPopup
- 划线 / 批注 / 书签 三 Tab
- 列表跳转定位（点击条目 → 跳到对应章 + posInfo/domPos 位置）
- 空态文案对照 Vue

### 2. 书签添加/删除（乐观 UI）
- store/bookmark-store.ts：pendingBookmarks（用 BookmarkItem.id 直接匹配，无需 clientId）
- 先更新角标/列表，再 onBookmarkCreate / onBookmarkDelete
- 失败 rollback

### 3. hooks/useReadingPositionReporter.ts
- debounce 800ms + 30s 定时 → onReadingPositionChange(ReadingSnapshot)
- 沿用 utils/reading-position-report.js 逻辑

### 4. overlays/ReadLoginTip
- 试读结束提示
- 触发 onLoginRequired('trial_end') / 'paid'

### 5. 书签匹配当前位置
- core/bookmark-match.ts（Phase 1 已移植）接入，NotesPopup 书签 Tab 高亮当前

## Vue 对照自查表

- [ ] 三 Tab：划线 / 批注 / 书签
- [ ] 列表跳转定位准确
- [ ] 空态文案与 Vue 一致
- [ ] 书签添加/删除乐观 UI（先角标/列表再回调，失败 rollback）
- [ ] 进度上报 debounce 800ms + 30s 定时
- [ ] 试读结束提示触发 onLoginRequired('trial_end')
- [ ] 视觉对照 打开笔记.png / 试读结束提示.png

## 交付物

- packages/reader/src/components/{popups/NotesPopup,overlays/ReadLoginTip}/*
- packages/reader/src/hooks/useReadingPositionReporter.ts
- packages/reader/src/store/bookmark-store.ts
- 自查报告

## 验收（总架构师）

- 笔记中心三 Tab 跳转定位
- 书签匹配当前位置
- 进度上报回调触发（debounce + 定时）
- 试读提示触发 onLoginRequired

## 源码对应关系（只读对照，源码是真理）

### 笔记中心 → components/NotesPopup/index.vue（805 行，**全文逐屏复刻**）
- 划线/批注/书签三 Tab、列表跳转定位、空态文案

### 试读提示 → components/ReadLoginTip/index.vue（217 行，全文）
- 试读结束提示文案与触发条件

### 书签匹配 → utils/bookmark-match.js（78 行，Phase 1 已移植，此处接入）
- 匹配当前位置书签

### 进度上报 → utils/reading-position-report.js（106 行，全文）
- debounce 800ms + 30s 定时 → onReadingPositionChange
- `buildReadPositionPayload`（reading-position.js:318）构造 snapshot

### 书签数据流 → store/reader-context.js
- `mergeBookmarks`（96）、`normalizeBookmarkItem`（53）、`mergeBookmarkItems`（73）
- 书签 CRUD：搜 saveBookmark/deleteBookmark 调用

### API（宿主侧，Phase 8 迁移，此处对照契约）
- api/bookmark.js：fetchBookmarks/saveBookmark/deleteBookmark
- api/reading-position.js：saveReadPosition/fetchReadPosition
- 真实 bookmark 字段见 接口案例.md（搜 getbookmark/savebookmark）

### 设计图
- old-vue-reader/prd/design/打开笔记.png、试读结束提示.png
