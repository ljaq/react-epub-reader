# Phase 11：性能优化与物理翻页手感专项

## 目标

消除覆盖/平移两模式拖拽卡顿与掉帧，使帧率达到第一梯队（60fps 满帧），同时引入物理弹簧翻页手感：
- 拖拽跟手走命令式 DOM 写入 + rAF 合帧，旁路 React render 热路径；
- 松手动画从固定 280ms CSS transition 升级为物理弹簧（带初速度、可打断），
  并引入 fling 判定（≥300px/s 甩动无视 40px 位置阈值直接翻页）；
- 消除每帧全量 HTML 字符串拼接与连带订阅重渲染。

## 诊断（卡顿根因）

**优化前每帧 pointermove 的开销链路：**

```
onPointerMove → setDragOffset(zustand) → 广播所有订阅者
  ├── HorizontalReader 整组件 re-render（vnode 重建、3章 segment 全量 re-diff）
  │   └── segmentHtml → wrapChapterHtmlWithNav（每帧拼接全章 HTML 字符串）
  │       └── dangerouslySetInnerHTML.__html 全串值比较（O(n) × 3章 × 60fps → GC 压力）
  ├── PagedReader 整组件 re-render（同）
  ├── useSelection 每帧 re-render + effect（cancelPendingLongPress + refreshSelectionPosition）
  └── PagedReader 拖拽跟手 effect 每帧空跑（克隆判断）
```

**Vue 原版为什么顺滑：** dragOffset 是组件 data，trackStyle 为 computed（只重算 transform 字符串），segment HTML 走 computed 缓存——每帧成本 ≈ 一次 transform 赋值。

**架构判断：** store 分片合理，双模式渲染壳划分合理，不需重构。问题仅是高频手势状态走了 React render 消费方式。

## 关键决策

1. **依赖零新增**：自研弹簧积分器（~80 行纯 TS）+ rAF 合帧器（~50 行），不入 react-spring/@use-gesture。
   理由：react-spring 的性能手法与本计划自研桥接完全相同（命令式直写 DOM），无增量；
   覆盖模式的打断落定/两阶段转正状态机与 spring API 难以契合。

2. **store 保持逻辑真源**：`dragOffset`/`dragStartX`/`isFlipping` 字段继续写 store（供判定/选区等逻辑消费），
   仅渲染层 transform 旁路 React。

3. **弹簧参数**：stiffness=400, damping=36, mass=1（秒制），ζ=0.9、ω=20rad/s、
   落定≈370ms、过冲<1px——对齐原 280ms ease-out 观感但速度连续。

4. **fling 阈值**：松手速度 ≥0.3px/ms（≈300px/s）时按速度方向直接翻页，无视 40px 位置阈值。
   速度方向须与拖拽位移方向一致（防回甩误判）。

5. **弹簧可打断**：新手势到达 → cancel 弹簧 + 立即写终点 → 状态收尾 → 新拖拽接管。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `core/motion/spring.ts` | 弹簧积分器：半隐式欧拉 + 固定 4ms 子步进（帧率无关），API `createSpringAnimation({from,to,velocity,onUpdate,onComplete}) → {cancel()}`，落定判定 |x-to|<0.5px 且 |v|<10px/s |
| `core/motion/index.ts` | motion 模块入口，导出弹簧与参数常量 |
| `core/__tests__/spring.test.ts` | 弹簧单测：收敛/初速度/过冲/取消/帧率无关/nudge 归位 |
| `hooks/raf-batcher.ts` | rAF 合帧器（`createRafBatcher`）：单帧合并多次 schedule 调用为一次 rAF 回调，零依赖 |
| `hooks/__tests__/raf-batcher.test.ts` | 合帧器单测：去重/批量/取消/多次调用仅一次 rAF |
| `hooks/useSlideMotionBridge.ts` | 平移模式运动桥接：vanilla subscribe zustand → rAF 合帧 → 命令式写 track.transform；暴露 `requestSync`/`playSpring`，抑制期直写终值 |
| `components/content/paged/useCoverMotionBridge.ts` | 覆盖模式运动桥接：当前页/克隆页 transform 命令式独占写入，拖拽会话回调驱动结构渲染，弹簧补间 `playSpring`，打断路径 cancel+归位+finalizeAnim 收尾 |
| `hooks/useTouchFlip.ts` | 新增速度采样（~100ms 环形缓冲 `samplesRef`）+ `computeReleaseVelocity` + `resolveDragTurnWithFling` fling 判定；松手速度写 `store.dragReleaseVelocity`；阴影兜底定时器改为 650ms |
| `core/pagination/index.ts` | 新增 `FLING_VELOCITY_THRESHOLD`(0.3) + `resolveDragTurnWithFling`：位置阈值优先，stay 时补查 fling |
| `core/__tests__/pagination.test.ts` | 新增 fling 判定单测：位置阈值优先/甩动翻页/低速 stay/回甩防误判/边界钳制 |
| `components/content/HorizontalReader.tsx` | 重写：移除 dragOffset/isRebalancing/layoutLocked 订阅；接入 `useSlideMotionBridge`；track 由桥接独占写入；分段 `SegmentView` React.memo（拖拽期间零 re-render） |
| `components/content/paged/PagedReader.tsx` | 重写：移除 dragOffset 订阅；接入 `useCoverMotionBridge`；animState/dragSession 降为低频结构状态（每次翻页仅 2–3 次 setState）；`ChapterFlow` React.memo |
| `components/content/paged/PageSurfaceView.tsx` | 整页 transform 移出 JSX，暴露 `rootRef` 供桥接命令式写入；仅保留 z 序/阴影 class/CSS 变量/切片位移 |
| `components/content/paged/paged-reader.css` | 注释补全：隐藏测量区 `translateX(-200%)` 背景说明（选区 findBodyFromPoint 基于 rect 包含命中） |
| `hooks/useSelection.ts` | `dragOffset` 布尔选择器（`isFlipDragging`）；拖拽期间选区位置逐帧跟随迁入命令式 subscribe + rAF 合帧（旁路 React） |
| `core/chapter-nav/index.ts` | `wrapChapterHtmlWithNav` 加有界 LRU 缓存（容量 8），同输入返回同一字符串引用，`dangerouslySetInnerHTML.__html` diff O(1) 短路 |
| `core/__tests__/reading-position.test.ts` | 新增 LRU 缓存单测 |
| `store/reading-store.ts` | 新增 `dragReleaseVelocity`（松手速度，消费型字段，桥接读取后即复位） |
| `core/selection/dom-path.ts` | `findBodyFromPoint` 修复：优先走 `document.elementFromPoint`（遵循 pointer-events:none 跳过隐藏流元素）防误命中隐藏 body，回退 rect 判定 |

## 残余掉帧与后续优化方向

### 已知残余：跨章提交瞬间卡顿

**现象：** 跨章边界翻页提交时，克隆深拷贝 + 新章 innerHTML 解析产生单次 ~60–230ms 阻塞，
表现为提交瞬间一帧大卡顿（非本次引入，与原 Vue 架构同源）。

**根因：**
- `usePageClones` 的 `cloneNode(true)` 对整章 DOM 深拷贝（含画像/表格）；
- 新章 `ChapterFlow` 的 `dangerouslySetInnerHTML` 触发浏览器 HTML 解析 + 布局（首帧同步）；
- 提交转正后 `applyMarks` 对整章遍历注入划线/批注包裹。

**建议后续专项：**

| 方向 | 预期收益 | 复杂度 |
| --- | --- | --- |
| **页容器池化复用 DOM** | 章节切换时复用旧容器 DOM 而非销毁重建，消除 `dangerouslySetInnerHTML` 的首帧解析成本；预热页在空闲 rAF 预解析 | 消除 ~60–200ms | 高：需重构 ChapterFlow 为 portal/复写 DOM，涉及划线/选区/posInfo 锚定链路重验证 |
| **克隆改为 CSS snapshot + paintWorklet** | 用 `element()` CSS 函数（Firefox only）或 OffscreenCanvas 快照替代 `cloneNode(true)`，避免 DOM 深拷贝 | 消除 ~15–40ms | 中：兼容性有限（需 <img> 兜底），且需处理滚动同步 |
| **Web Worker 预解析** | 将 HTML 解析 + mark 包裹移入 Worker，主线程只替换 DOM | 消除 ~50–150ms | 高：需序列化 DOM/重新挂载事件与 ref，选区锚定需重建 |
| **IntersectionObserver 预热相邻页** | 阅读中提前让浏览器解析邻居章 HTML（挂 offscreen 但不触发 applyMarks），切章时直接 swap | 消除 ~50–100ms | 中：需额外内存（+2 章完整 DOM），buffer 内存计算需调整 |
| **克隆时机后移** | 轴锁定 x 后不在首次 move 克隆，改为在 `dragOffset` 超过阈值后再克隆（减少误触开销） | 减少不必要克隆 | 低：不影响提交路径，仅消除未触发翻页的克隆浪费 |

### 次要优化（低优先级）

| 方向 | 说明 |
| --- | --- |
| `buffer` 选择器细化 | 当前 `HorizontalReader`/`PagedReader` 订阅整个 `buffer` 对象，`updateBufferPageCounts` 等非结构 patch 也触发 re-render。可改为深比较选择器或拆分为多个独立 slice |
| `SegmentView`/`ChapterFlow` memo 粒度 | 当前 `html` prop 走 LRU 缓存引用稳定，但 `contentBodyStyle`/`pageWidth` 变化仍会穿透 memo。可改为稳定对象引用（useRef + 手动更新） |
| CSS `content-visibility: auto` | 离屏 segment 启用 `content-visibility` 跳过渲染，减少 buffer 内未读章节的布局开销 |
| 虚拟滚动 buffer 窗口 | 当前 buffer 固定 ±1 章（横划 3 章 segment），超长章节滚动可扩展为按可见页 + 前后各 2 页的滑动窗口 |

## 性能验收数据

| 场景 | 优化前（估算） | 优化后（playwright rAF 探针） |
| --- | --- | --- |
| 覆盖模式慢拖 500ms | ~30–50ms/帧（掉帧明显） | mean 16.7ms / p95 17.3ms / **0 掉帧**（满帧 60fps） |
| 覆盖模式快速连滑 ×4（打断路径） | ~50–120ms/帧 | p95 17.7ms |
| 平移模式快速连翻 | ~30–80ms/帧 | p95 17.6ms |

## 回归清单

全量验证通过（207 tests）：

- ✅ DRAG_THRESHOLD=40 / AXIS_LOCK_THRESHOLD=8 行为保持
- ✅ 首末页阻尼
- ✅ 覆盖模式快速连滑打断落定
- ✅ 覆盖模式两阶段跨章转正
- ✅ 右滑前缘锚定手指（dragStartX）
- ✅ 长按选中 / 划线显示 / 划线角标点击
- ✅ 点击 20%/80% 分区
- ✅ 章首/章末导航按钮
- ✅ 竖滚模式（VerticalReader）不动
- ✅ reader 包构建通过

## 已知约束

- 覆盖模式仅初始化后第一页 / 短章（bodyWidth ≤ 2×viewport）能长按选中的 bug
  已在 Phase 11 修复（`findBodyFromPoint` 的 `elementFromPoint` 优先判定），
  详见 `core/selection/dom-path.ts`。

- 划线翻页后消失 bug 已在 Phase 12 修复：根因是 `dangerouslySetInnerHTML={{__html}}`
  每次 re-render 创建新对象，React 比较对象引用（非 `__html` 值）触发 `innerHTML` 重置，
  销毁 `applyChapterLines` 注入的 `<mark>` 元素。修复见（`SegmentView`/`ChapterFlow` 的
  `useMemo(() => ({ __html: html }), [html])`）+ （`ReaderContent` effect 补 `pageIndex` 依赖）。
