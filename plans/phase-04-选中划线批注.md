# Phase 4 — 选中 + 划线 + 批注（子 Agent D）

> 执行者：子 Agent D。前置：Phase 1 done（core/selection、core/highlights）+ Phase 2 done（content/hooks）。产出选中交互、划线/批注 DOM 高亮、乐观 UI、写批注面板。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§4 LineItem/NoteItem、§6 onLine*/onNote*/onAnnotationError、§7 reconcile 协议）
3. old-vue-reader/components/{SelectionOverlay,SelectionHandles,SelectionBubble,WriteAnnotationPanel,AnnotationListPopup}/
4. old-vue-reader/components/ReaderContent/index.vue（handleSaveLine/handleLineColorChange/handleEraseLine，~2130-2340 行）
5. old-vue-reader/prd/cursor-plan/07-选中交互.md、08-划线批注.md
6. old-vue-reader/prd/design/ 6 张选中/划线设计图

## 任务清单

### 1. overlays/selection/
- SelectionOverlay / SelectionHandles / SelectionBubble
- 横划 fixed / 竖滚 scroll 双模式定位

### 2. hooks/useSelection.ts
- 长按 450ms 触发选中
- 横划/竖滚双模式（SELECTION_MODE_HORIZONTAL/VERTICAL）
- 拖边界调整选区

### 3. store/annotation-store.ts
- pendingLines / pendingNotes（clientId = webLineId/webNoteId）
- 与 props lines/notes 合并 reconcile（props 更新时 clientId 匹配 → 替换服务端 id → 清 pending）

### 4. 乐观 UI 流程（划线/批注统一）
1. wrapLineMark / syncChapterNotes — 立即改 DOM
2. 写入 pending（tempId = generateReaderWebId()）
3. 同步调用 onLineCreate / onNoteCreate（不 await，payload 带 clientId）
4. 宿主 API 成功 → props 回写带 clientId → reconcile id
5. 失败 → unwrap + 移除 pending + Toast + 可选 onAnnotationError

### 5. 已有划线操作
- 擦除：先 unwrapLineMark DOM 再 onLineDelete，失败 rollback（对齐 handleEraseLine）
- 改色：先 applyLineMarkStyle DOM 再 onLineUpdate，失败 rollback（对齐 handleLineColorChange）

### 6. popups/WriteAnnotationPanel + AnnotationListPopup
- 写批注 / 批注列表

### 7. 批注 DOM 高亮 + 角标定位
- 横划 fixed / 竖滚 scroll

### 8. 登录拦截
- 未登录触发划线/批注 → onLoginRequired('auth')

## Vue 对照自查表

- [ ] 长按 450ms 触发选中
- [ ] 选中双模式 HORIZONTAL/VERTICAL
- [ ] 拖边界调整选区
- [ ] 划线色值规则：>7 黄底，≤7 蓝线
- [ ] 划线创建/改色/擦除：DOM 先于 API，失败 rollback
- [ ] 批注写/列表/删除：乐观 UI
- [ ] 选中→划线/批注后无等待感（DOM 即时变化）
- [ ] API 失败回滚正确
- [ ] 黄底/蓝线切换
- [ ] 未登录触发 onLoginRequired
- [ ] 视觉对照 6 张设计图

## 交付物

- packages/reader/src/components/{overlays/selection,popups/WriteAnnotationPanel,popups/AnnotationListPopup}/*
- packages/reader/src/hooks/useSelection.ts
- packages/reader/src/store/annotation-store.ts
- 自查报告

## 验收（总架构师）

- 选中→划线 DOM 即时变化（无等待感）
- API 失败回滚正确（mock 故意返回失败验证）
- clientId reconcile 协议与 §7 一致
- 长按 450ms 常量抽查

## 源码对应关系（只读对照，源码是真理）

### 选中交互组件
- SelectionOverlay → components/SelectionOverlay/index.vue（42 行）
- SelectionHandles → components/SelectionHandles/index.vue（203 行，拖边界调整）
- SelectionBubble → components/SelectionBubble/index.vue（397 行，气泡三种态：划线/批注/擦除改色）

### 选中引擎（Phase 1 已移植 core/selection，此处接入 UI）
- utils/selection-engine.js（265）+ selection-text-pos.js（526）+ selection-dom-path.js（174）
- 长按 450ms：搜 ReaderContent `handleTouchStart` 中的定时器常量
- 双模式：SELECTION_MODE_HORIZONTAL/VERTICAL（selection-dom-path.js:6-7）

### 划线/批注乐观 UI（**核心对照**）→ components/ReaderContent/index.vue
- `handleSaveLine`：第 2232 行（先 wrapLineMark + upsertChapterLine，再 saveLine，失败 unwrap）
- `handleLineColorChange`：第 2165 行（先 applyLineMarkStyle DOM，再 editLine，失败 rollback）
- `handleEraseLine`：第 2310 行（先 unwrapLineMark DOM，再 deleteLine，失败回 wrap）
- 分发入口：第 2132–2148 行

### 高亮 DOM（Phase 1 已移植 core/highlights，此处接入）
- utils/line-highlight.js（684）：wrapLineMark/unwrapLineMark/updateLineMarkStyle/applyChapterLines/detectDuplicateLine
- utils/note-highlight.js（266）：wrapNoteMark/syncChapterNotes/syncNoteBadges（BADGE_TOP_OFFSET=20）

### 状态回写 → store/reader-context.js
- `upsertChapterLine`（741）、`removeChapterLine`（752）、`upsertChapterNote`（760）、`removeChapterNote`（771）

### 写批注/批注列表
- WriteAnnotationPanel → components/WriteAnnotationPanel/index.vue（242 行，全文）
- AnnotationListPopup → components/AnnotationListPopup/index.vue（137 行，全文）

### API（宿主侧，Phase 8 迁移，此处仅对照契约）
- api/line.js：saveLine/editLine/fetchLineList/deleteLine
- api/note.js：saveNote/fetchNoteList/deleteNote
- 真实 payload 见 接口案例.md 第 18–38 行（发起划线）、第 155–176 行（发起批注）

### 设计图
- old-vue-reader/prd/design/ 6 张选中/划线/批注相关 PNG（搜 selection/line/note）
