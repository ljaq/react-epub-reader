# Phase 12 — 性能优化第二期

## 背景

用户报告 4 个性能问题，需逐一定位根因并修复；同时思考其他优化空间。

## 修复 v2（经回滚迭代后的最终版本）

首次尝试引入了 3 个回归问题（详见文末「已回滚的尝试」），经根因分析后回滚并用更安全的方案替代。

---

## 最终生效的修改

### 1. 平移模式松手卡顿

**根因**：`endDrag()` 中 `turnPage()`（→ `setGlobalPageIndex`）触发 React 同步重渲染，在真机上阻塞主线程 50–200ms，期间运动桥接的弹簧 rAF 无法执行，用户感知卡顿。

**方案**：用 `React.startTransition` 包裹 `turnPage()`，将 React 重渲染标记为低优先级可中断任务。zustand store 仍同步更新（桥接 rAF 读到正确目标），React 渲染被标记为 transition 后可与 rAF 交错执行，不再阻塞弹簧启动。

**改动**：`packages/reader/src/hooks/useTouchFlip.ts:167-175`

```typescript
startTransition(() => {
  if (action === 'next-page') turnPage(1)
  else if (action === 'prev-page') turnPage(-1)
})
setDragOffset(0)
```

---

### 2. 覆盖模式拖拽无反应

**根因**：`AXIS_LOCK_THRESHOLD = 8` 偏高，覆盖模式下微动（<8px）手势被忽略，用户体感「无反应」。

**方案**：将阈值从 8 降至 4。平移模式 viewport-h 已设 `touch-action: none`，不受影响。

**改动**：`packages/reader/src/hooks/useTouchFlip.ts:31`

---

### 3. finalizeAnim 批量合并 setState（覆盖模式）

**根因**：弹簧 `onComplete` 在 rAF 内触发 `finalizeAnim`，3 次 `useState` setter 不在 React 事件处理器内，React 18 不会自动批处理，触发 3 次独立渲染。

**方案**：用 `unstable_batchedUpdates` 包裹所有 React setState 调用，合并为单次渲染。保持原始 zustand/React setState 交错顺序不变（先 React state，后 zustand action），避免时序问题。

**改动**：`packages/reader/src/components/content/paged/PagedReader.tsx:152-184`

---

### 4. PageSurfaceView React.memo

**根因**：`PageSurfaceView` 未包裹 `memo`，每次 PagedReader 低频结构渲染时两个页实例均重渲染。

**方案**：`React.memo` 包裹，props 全为原始值/稳定引用，diff 成本低。

**改动**：`packages/reader/src/components/content/paged/PageSurfaceView.tsx`

---

### 5. CSS content-visibility（切章卡顿缓解）

**根因**：切章时 `dangerouslySetInnerHTML` 注入大段 HTML → 浏览器解析 + 多列 layout → 强制 reflow。

**方案**：为 `.reader-content__segment` 和 `.paged-reader__hidden-flow` 添加 `content-visibility: auto`，延迟非可视区域布局。

**改动**：
- `packages/reader/src/components/content/reader-content.css`
- `packages/reader/src/components/content/paged/paged-reader.css`

---

## 修复 v3 + v4（平移模式松手后仍卡顿 · 实测定位的完整根因链）

**现象**：平移模式松手后仍卡顿一段，且当前页在章节内越靠后越明显。

**实测方法**（v3 修复后用户反馈未解决，改为实测）：h5-demo 大章节（480 段）+
CDP 6x CPU 降速模拟真机，`Profiler` 抓拖拽松手窗口 + `Range.prototype.getClientRects`
调用栈探针。深页（第 10 页）翻页录得 **2384ms longtask**，`getClientRects` 自耗时
1639ms，调用方栈直达渲染路径。

**根因**：`computeBookmarkAnchor()` 从章首第一个字符开始**逐字符创建 Range 调
`getClientRects()`**，直到找到视口内第一个可见字符——成本 O(当前页之前的字符数)，
页越靠后越卡。该函数经 `computeReadingSnapshotFromDom()` 被**四个**路径调用，
v2 只修了 ReaderContent 书签角标一处，其余三处漏网：

| # | 调用点 | 触发时机 | 修复 |
|---|--------|---------|------|
| 1 | `NotesPopup.tsx` 渲染期 `computeReadingSnapshotFromDom()` | **每次翻页**（组件订阅 pageIndex 且恒挂载，`if (!visible) return null` 在扫描之后） | v4：快照计算移到 visible 早退之后；横划传 null |
| 2 | `useBookmarkActions.getCurrentBookmark()`（TopBar 渲染期调用） | **每次翻页**（TopBar 随 ReaderChrome 订阅 pageIndex 重渲染） | v4：横划传 null（findBookmarkAtSnapshot 横划分支只用 pageIndex） |
| 3 | `useReadingPositionReporter.buildPosPayload()` | 每次翻页 800ms debounce 后（仅登录用户） | v3：`coarseHorizontalAnchor` 段落级粗锚点（横划 payload 恢复主键是 cur/totalPage，无需字符级 domPos） |
| 4 | `ReaderContent` 书签角标 | 每次翻页渲染 | v2 已修 |

**v3 改动**（reporter 粗锚点）：
- `core/reading-position/snapshot-build.ts`：`computeBookmarkAnchor`/`buildReadingSnapshot`
  新增 `coarseHorizontalAnchor` 参数与粗锚点分支（elementFromPoint 段落级锚点，O(段落数)）
- `hooks/useReadingSnapshot.ts`：`computeReadingSnapshotFromDom` 透传选项
- `hooks/useReadingPositionReporter.ts`：`buildPosPayload` 横划时传 `coarseHorizontalAnchor: true`

**v4 改动**（渲染期扫描移除）：
- `components/popups/NotesPopup/NotesPopup.tsx`：快照计算移到 `if (!visible) return null`
  之后，且横划传 null
- `hooks/useBookmarkActions.ts`：`getCurrentBookmark` 横划时传 null snapshot

**实测验证**（同一深页拖拽，6x CPU 降速）：
- 修复前：longtask **2384ms**，`getClientRects` 自耗时 1639ms
- 修复后：longtask **209ms**（余量为 dev 模式 React 渲染开销，生产构建更低），
  `getClientRects` 从 profile 消失，深页/浅页耗时与页码位置解耦

**回归验证**：reader 包 194/194 单测通过（含将 `AXIS_LOCK_THRESHOLD` 断言从 8 更新为 4
——v2 已落地的有意变更，原断言遗漏同步）。

---

## 已回滚的尝试（v1 → v2）

以下改动在 v1 中实施，因引入回归已全部回滚：

| 改动 | 回归现象 | 回滚原因 |
|------|---------|---------|
| `endDrag` 交换 `setDragOffset(0)` 和 `turnPage()` 顺序 | 真机更卡顿 | React 重渲染与弹簧 rAF 争夺主线程 CPU，导致弹簧帧被跳过 |
| `useCoverMotionBridge` 推迟 `onDragSessionChange` 到下一 rAF | 覆盖模式闪烁 | 克隆 PageSurfaceView 延迟一帧挂载，导致底页空白闪烁 |
| `usePageClones` 同步 cloneNode + useLayoutEffect + cloneReadyRef 守卫 | 覆盖模式闪烁 | `cloneReadyRef` 守卫在点击翻页路径推迟弹簧一帧，页面停留在中间态 |
| `finalizeAnim` 将 zustand action 移到 `unstable_batchedUpdates` 之前 | 覆盖模式闪烁 | zustand action 先于 React setState 执行破坏了原有的桥接状态同步顺序 |

---

## 修改文件汇总（最终版）

| 文件 | 改动内容 |
|------|---------|
| `packages/reader/src/hooks/useTouchFlip.ts` | AXIS_LOCK_THRESHOLD 8→4；`startTransition` 包裹 `turnPage()` |
| `packages/reader/src/components/content/paged/PagedReader.tsx` | `unstable_batchedUpdates` 合并 `finalizeAnim` 的 React setState（保持原顺序） |
| `packages/reader/src/components/content/paged/PageSurfaceView.tsx` | `React.memo` 包裹 |
| `packages/reader/src/components/content/reader-content.css` | segment 添加 `content-visibility: auto` |
| `packages/reader/src/components/content/paged/paged-reader.css` | hidden-flow 添加 `content-visibility: auto` |
| `packages/reader/src/core/reading-position/snapshot-build.ts` | v3：`coarseHorizontalAnchor` 粗锚点分支 |
| `packages/reader/src/hooks/useReadingSnapshot.ts` | v3：透传 `coarseHorizontalAnchor` 选项 |
| `packages/reader/src/hooks/useReadingPositionReporter.ts` | v3：横划时粗锚点，跳过逐字符扫描 |

未改动文件（保持与原始一致）：
- `usePageClones.ts`
- `useCoverMotionBridge.ts`
- `HorizontalReader.tsx`
- `useSlideMotionBridge.ts`
- `spring.ts`
- `reading-store.ts`
