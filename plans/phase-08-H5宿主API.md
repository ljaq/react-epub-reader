# Phase 8 — H5 宿主 + API 迁移（子 Agent H，贯穿全程）

> 执行者：子 Agent H。前置：Phase 0 done。贯穿全程：每完成一个 phase，H 提供对应 mock 接口与 ReaderHost 桥接更新。H 不阻塞单 phase 启动，但 phase 验收需 H 侧 mock 可跑通。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§5 Props、§6 回调、§7 reconcile、§10 约束）
3. old-vue-reader/api/*（全部迁移源）
4. old-vue-reader/api/mock-data.js
5. old-vue-reader/prd/接口案例.md（字段对齐基准）

## 任务清单

### 1. 迁移 api/（TS）
- chapter.js → api/chapter.ts：fetchChapterList / fetchChapterContent / fetchBookMeta / fetchCheckRead
- line.js → api/line.ts：saveLine / editLine / fetchLineList / deleteLine
- note.js → api/note.ts：saveNote / fetchNoteList / deleteNote
- bookmark.js → api/bookmark.ts：fetchBookmarks / saveBookmark / deleteBookmark
- tts.js → api/tts.ts：fetchTtsAudio / fetchTtsAudioRaw
- tts-report.js → api/tts-report.ts：reportTtsReadTime
- reading-position.js → api/reading-position.ts：saveReadPosition / fetchReadPosition
- thought.js → api/thought.ts：fetchThoughtList / likeThought / cancelThoughtLike / saveThought
- request-helper → api/request-helper.ts（get/post，rentId/appId 注入）

### 2. host/ReaderHost.tsx
- 集中管理：章节缓存、预取队列、标注 CRUD 回写、TTS 音频请求/注入、用户态
- Props ↔ 回调桥接：实现 §5 全部 Props 与 §6 全部回调
- 乐观 UI reconcile：保存 clientId → serverId 映射，回写 lines/notes/bookmarks 时带 clientId（一个周期）
- TTS：onTtsAudioRequest → fetchTtsAudio → 注入 ttsAudioUrl prop（按 reqId）
- 阅读位置：onReady 后注入 initialPosition；onReadingPositionChange → saveReadPosition（debounce 由 reader 处理，host 直接存）

### 3. host/host-store.ts
- 章节内容 Map（Record<chapterId, ChapterContent>）
- chapterAccess / chapterLoadStates
- lines/notes/bookmarks 按章索引
- user / bookMeta / ttsVoiceTypes
- clientId → serverId 映射

### 4. Mock 数据
- 沿用 mock-data.js，USE_MOCK 开关（默认 true）
- 写操作更新内存 store，list 接口可读到
- 公共 query：rentId=105883 / appId=13673ce1（mock 常量）
- fetchChapterContent 传 width（容器宽度，默认 398）

### 5. 路由
- react-router 接入 /book/:id/read
- 随感路由 /book/:id/thoughts（Phase 9 接，此处留空壳）

### 6. rentId/appId 注入
- 通过宿主环境（env 或 props）注入，reader 包零感知

### 7. 随每个 phase 更新桥接
- Phase 2 done → 章节/chapters/chapterLoadStates 桥接
- Phase 4 done → 标注乐观 UI reconcile
- Phase 5 done → 书签/进度桥接
- Phase 6 done → TTS 音频流桥接

## Vue 对照自查表

- [ ] api/ 全部模块迁移，函数签名与接口案例.md 端点一致
- [ ] USE_MOCK 开关，mock 内存 store 写后可读
- [ ] rentId/appId 注入，reader 包零感知
- [ ] fetchChapterContent 传 width
- [ ] ReaderHost 实现 §5 全部 Props
- [ ] ReaderHost 实现 §6 全部回调
- [ ] 乐观 UI clientId reconcile 协议与 §7 一致
- [ ] TTS onTtsAudioRequest fire-and-forget + ttsAudioUrl prop 注入
- [ ] onReady 后注入 initialPosition
- [ ] reader 包内无 fetch / USE_MOCK / 路由引用（lint 验证）

## 交付物

- apps/h5-demo/src/api/*
- apps/h5-demo/src/host/{ReaderHost,host-store}.tsx
- apps/h5-demo/src/routes/（含随感空壳）
- 自查报告

## 验收（总架构师）

- 全功能走 Mock API 可跑通
- 切 USE_MOCK=false 可对接真实接口（字段对齐 接口案例.md）
- reader 包零 fetch（grep 验证）
- clientId reconcile 协议端到端验证（划线 → mock 成功 → id 替换；mock 失败 → rollback）

## 源码对应关系（只读对照，源码是真理）

### API 迁移（**逐文件 1:1 迁移为 TS**）
- api/index.js（13 行）：USE_MOCK 开关 + re-exports
- api/chapter.js：fetchChapterContent（/nextchapter，传 width）、fetchChapterList（/chapter）、fetchBookMeta（/read）、fetchCheckRead（/checkread）
- api/line.js：saveLine（/read/line/save）、editLine（/read/line/edit）、fetchLineList（/read/line/list）、deleteLine（/read/line/del）
- api/note.js：saveNote（/read/note/save）、fetchNoteList（/read/note/list）、deleteNote（/read/note/del）
- api/bookmark.js：fetchBookmarks（/getbookmark）、saveBookmark（/savebookmark）、deleteBookmark（/deletebookmark）
- api/tts.js：fetchTtsAudioRaw（POST /audio/tts，参数 bookId/chapterId/text/voiceType/reqId）
- api/tts-report.js：reportTtsReadTime
- api/reading-position.js：saveReadPosition、fetchReadPosition
- api/thought.js：fetchThoughtList（/topic/list/more）、likeThought（/api/topic/like）、cancelThoughtLike（/api/topic/canclelike）、saveThought（/topic/add）
- api/mock-data.js：mock 内存 store，写操作更新后 list 可读

### 真实字段对齐基准 → prd/接口案例.md（811 行）
- 章节内容：第 1–16 行（chapterName/html/hasNext/pageButton）
- 发起划线：第 18–38 行（summary 含 posInfo + underlineColor，id=er... webLineId）
- 划线列表：第 40–134 行（按 chapterId 分组，items 按 webLineId 索引，含 id/webLineId/time/posInfo/summary/underlineColor）
- 删除划线：第 135 行起
- 发起批注：第 155–176 行
- 批注列表：第 177–241 行
- 章节列表：第 242–388 行（chapterName/id/wordCount/jumpUrl/tag/isOrder/anchorId）
- bookmark：搜 getbookmark/savebookmark

### 宿主桥接参考 → store/reader-context.js（1517 行）
- 这是 Vue 版「Props+回调」的等价物，迁移时把它的数据/状态/动作拆分：
  - 数据 → host-store.ts（chapters/chapterAccess/lines/notes/bookmarks/user/bookMeta）
  - UI 状态 → reader 内 store（不在 host）
  - 动作 → ReaderHost 的回调实现（onChapterChange→loadSingleChapter、onLineCreate→saveLine 等）
- 关键函数行号见 Phase 2 源码对应关系

### 公共参数
- rentId=105883 / appId=13673ce1（接口案例.md 全部请求带）：通过宿主 env/props 注入，reader 零感知
- fetchChapterContent 传 width（容器宽度，默认 398，源自 utils/reader-viewport.js）

### 乐观 UI reconcile（**契约 §7**）
- 宿主保存 clientId → serverId 映射
- saveLine 成功 → 回写 lines prop 时对应项带原 clientId（一个渲染周期）
- reader 据此 reconcile；失败 → reader 侧 rollback 已处理，host 仅不回写
