# Phase 2 — 阅读引擎 UI（子 Agent B）

> 执行者：子 Agent B。前置：Phase 1 done（依赖 core/）。产出双模式阅读核心，Props 驱动、回调输出。

## 目标

实现横划/竖滚双模式阅读引擎，章节缓冲池，Props 驱动渲染、回调输出。这是整个阅读器的渲染底座。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§3 状态边界、§5 Props、§6 回调、§7 reconcile）
3. old-vue-reader/components/ReaderContent/index.vue（只读对照，~2300 行）
4. old-vue-reader/prd/cursor-plan/02-阅读引擎.md
5. old-vue-reader/prd/design/阅读器.png

## 任务清单

### 1. content/ReaderContent.tsx
- 模式分发：settings.horizontalEnabled ? HorizontalReader : VerticalReader
- 接收 chapters/chapterLoadStates props，渲染当前章 + buffer

### 2. content/HorizontalReader.tsx
- 横划轨道 + usePagination hook（消费 core/pagination）
- transform: translateX(-(globalPageIndex × stride) + dragOffset)
- 章首/章末导航按钮（wrapChapterHtmlWithNav）
- 章末按钮依据 ChapterContent.hasNext 显隐/置灰

### 3. content/VerticalReader.tsx
- 竖滚单章，章内滚动，竖滑不切章
- 章首/章末导航按钮

### 4. hooks/useChapterBuffer.ts
- 监听 onChapterChange/onPrefetch 回调输出
- 消费宿主注入的 chapters prop（Record<chapterId, ChapterContent>）组装 buffer
- 内部 buffer 状态（segments/offsets/pageCounts/silentExpand/loading）走 reading-store

### 5. hooks/usePagination.ts
- 横划分页计算，layoutLocked / isRebalancing 机制（沿用 Vue）
- ensureChapterBuffer rebalance + offsetAdjustPages instant 修正

### 6. hooks/useTouchFlip.ts
- 横滑跟手：dragOffset 实时更新（reading-store，独立 slice 避免全树渲染）
- 横滑阈值 40px 触发翻页
- 点击左/右 20% 翻页；中央 20%-80% 唤起 UI（调 ui-store.toggleUi）

### 7. hooks/useContentStyles.ts
- 主题/字号/行距（源自 utils/reader-content-styles.js）
- 消费 settings-store

### 8. store/reading-store.ts
- globalPageIndex / dragOffset / isRebalancing / layoutLocked / segmentOffsets
- 高频更新独立 slice，避免 Reader 根组件因 props 变化重渲染引擎

### 9. store/ui-store.ts
- uiVisible / activePanel / popups

### 10. store/settings-store.ts
- zustand persist → localStorage key 'h5-reader-settings'
- 字段：theme、brightness、spacing、fontSize、fontWeight、horizontalEnabled、eyeCareMode

### 11. 章节加载态 UI
- chapterLoadStates[id]='loading' → 骨架
- 'error' → 错误态 + 触发 onError

## 关键数据流

```
用户翻页至章边界 → onChapterChange(nextId, width)
宿主 fetch 章节 → 更新 chapters prop
阅读器 buffer 重组 → 继续横划（无 DOM 切换闪烁）
同时 onPrefetch([prevId, nextId], width) → 宿主预取
```

## Vue 对照自查表

- [ ] 横划阈值 40px（utils/pagination 或 ReaderContent 常量）
- [ ] 点击左/右 20% 翻页；中央 20%-80% 唤起/隐藏 UI
- [ ] 章内边距 20px 24px（对照设计图）
- [ ] 竖滑不切章（竖滚模式）
- [ ] 章首 pill「上一章」左对齐 + 章末通栏「下一章」（wrapChapterHtmlWithNav）
- [ ] 章末按钮依据 hasNext 显隐/置灰
- [ ] layoutLocked / isRebalancing 机制保留
- [ ] ensureChapterBuffer rebalance + offsetAdjustPages instant 修正
- [ ] 章间无闪烁（buffer 重组不触发 DOM 重挂）
- [ ] onChapterChange 携带 width（容器测量值，默认 398）
- [ ] onPrefetch 携带 width
- [ ] dragOffset 走独立 store slice，不引起 Reader 根重渲染
- [ ] 视觉对照 阅读器.png

## 交付物

- packages/reader/src/components/content/*
- packages/reader/src/hooks/{useChapterBuffer,usePagination,useTouchFlip,useContentStyles}.ts
- packages/reader/src/store/{reading-store,ui-store,settings-store}.ts
- 自查报告

## 验收（总架构师）

- Mock 数据下横划/竖滚可翻页
- 章间无闪烁
- 点击区域与横滑手势生效
- reading-store 独立 slice 验证（dragOffset 高频更新不触发 Reader 根 re-render，可用 React DevTools profiler 抽查）
- 回调签名与 §6 一致

## 源码对应关系（只读对照，源码是真理）

### 阅读引擎主体 → components/ReaderContent/index.vue（2692 行，**最核心**）
- `watch`（第 399 行）、`created`（550）、`mounted`（575）、`methods`（633）
- `wrapChapterHtmlWithNav` 调用：第 241、662 行
- 翻页/切章逻辑：第 1265–1410 行（`goChapter`/`nextChapter`/`prevChapter`/`toggleUi` 调用）
- 选中→划线/批注分发：第 2132–2148 行（`handleSaveLine`/`handleLineColorChange`/`handleEraseLine`）
- `handleSaveLine`（2232）、`handleLineColorChange`（2165）、`handleEraseLine`（2310）：**Phase 4 重点对照**
- 横划跟手 / 点击分区 / 触摸事件：搜 `handleTouchStart`/`handleTouchMove`/`handleTouchEnd`/`handleClick`，对照常量（40px 阈值、20%/80% 分区、20px 24px 内边距）
- 竖滚分支：搜 `horizontalEnabled` 取反分支

### 状态/数据流 → store/reader-context.js（1517 行，**第二核心**）
- `loadSingleChapter`（205）、`fetchChapterWithAccess`（199）、`resolveChapterAccess`（173）
- `rebuildChapterBuffer`（337）、`initChapterBuffer`（1128）、`ensureChapterBuffer`（1134）、`fetchNeighborsInBackground`（310）、`getReaderPrefetchOptions`（303）
- `applyBufferCenterState`（238）、`shouldPreserveAnchor`（255）、`mergeNeighborContentsIntoBuffer`（260）
- `goChapter`（1271）、`nextChapter`（1289）、`prevChapter`（1316）
- `upsertChapterLine`（741）、`removeChapterLine`（752）、`upsertChapterNote`（760）、`removeChapterNote`（771）
- `navigateToDomPos`（904）、`navigateToNavTarget`（929）、`loadAnnotations`（948）
- `toggleUi`（655）、`setActivePanel`（589）
- `getViewportWidth`（127，width=398 来源）、`syncChapterFromGlobal`（134）
- TTS：`isTtsActivelyPlaying`（393）、`resolveTtsPlaybackStartMode`（397）、`syncTtsSessionAfterStart`（419）、`openTtsPopup`（1417）、`startTtsPlayback`（1456）、`startTtsFromCurrentRead`（1494）——**Phase 6 重点对照**

### 设置持久化 → store/reader-settings.js（110 行，全文）
- `loadSettings`/`saveSettings` → localStorage；字段：theme/brightness/spacing/fontSize/fontWeight/horizontalEnabled/eyeCareMode

### 内容样式 → utils/reader-content-styles.js（43 行，全文）
- 主题/字号/行距样式生成

### 章节访问 → utils/chapter-access.js（37 行）
- 10003 needLogin、10004 needPurchase（Phase 1 已移植，此处接入渲染）

### 设计图
- old-vue-reader/prd/design/阅读器.png（横划主态）
- 其他设计图：唤起工具栏.png / 打开目录.png 等（Phase 3 用）
