# Phase 10：真分页与覆盖翻页（掌阅级）

## 目标

把横排阅读从「一章一条连续排版流、整体平移切页」升级为「每页一个独立页面单元」的页式结构，覆盖模式达到掌阅级效果：

- 左滑看下一页：新页面静止在底层，旧页面向左滑出；
- 右滑看上一页：当前页静止在底层，上一页从左侧滑入盖住当前页，移动页带前缘阴影；
- 拖拽跟手、松手按阈值提交或回弹；点击左右 20%/80% 分区播放同样的完整覆盖动画；
- 跨章边界（章末滑向下一章首页）动画无缝衔接；首末页阻尼（不建克隆，当前页衰减位移露出底色）。

仿真翻页本期不实现，但 PageSurface 抽象为其铺路。

## 关键决策（方案 A：隐藏规范流 + 窗口化克隆页）

1. **主从页式结构**
   - 规范流（canonical flow）：每章一份完整多列排版流（沿用 `reader-content__body--columns` + columnWidth/columnGap 内联），仍是 posInfo 锚定、applyMarks、选区取词、nav-target 换算、useBookCss 注入的唯一作用对象——划线/批注/跳转逻辑零迁移。
   - 当前页 = 规范流本体：PagedReader 当前页容器（overflow:hidden 页尺寸盒）直接持有当前章规范流，`translateX(-localPageIndex × stride)` 显示对应页切片；章内翻页只改 transform，不重建 DOM。
   - 相邻页 = 短命克隆切片：拖拽/动画需要时对目标章规范流 `cloneNode(true)`（已含 mark），标记 `aria-hidden + inert + pointer-events:none + data-clone`，不注册 bodyMap、不参与选区与点击；手势/动画落幕后销毁。
   - 邻居章规范流挂在 offscreen 隐藏测量区（visibility:hidden + translateX(-200%) 移出视口——选区 findBodyFromPoint 基于 rect 包含命中，visibility 不影响 rect，必须物理移出避免误命中隐藏 body），供 usePagination 沿用 scrollWidth 法测量并作为克隆源；buffer（±1 章窗口）与测量逻辑复用不改。

2. **平移模式保留 HorizontalReader 不动**，cover 用新 PagedReader：两条渲染路径共享 buffer/pagination/手势/划线层，平移路径零回归风险。

3. **克隆时机**：轴锁定 x 且方向确定后首次 move 才克隆；点击/竖滑不产生克隆；点击翻页走同一克隆 + 补间流程。

4. **flipMode 状态迁移**：`ReaderSettings.flipMode: 'cover'|'slide'|'vertical'|'simulation'` 四档全保留；开发阶段**不做老用户习惯迁移**——旧 persist 数据（无 flipMode 或非法值）一律回落默认 cover，不按 `horizontalEnabled` 推导；`horizontalEnabled` 保留为派生同步字段，下游消费方零改动；划线/批注等存量数据走 posInfo 锚定，与翻页模式无关，天然兼容。

5. **动画期缓冲锁**：补间进行中 `flipAnimating=true`，usePagination 禁止 rebalance/silentExpand/重排滑动 ±1 章窗口，提交落幕补跑 `scheduleBufferRebalance()`。

6. **跨章两阶段转正**：提交页码后新章规范流先挂载（克隆层盖顶遮闪烁），registerBody 触发 applyMarks 后双 rAF 撤克隆。

7. **pretext 保留不接线**：测量继续用浏览器排版 + scrollWidth 法（对图片/表格/复杂样式保真最高）；`@chenglou/pretext` 依赖保留（被 tree-shake 不影响产物），`core/layout-pretext/` 维持空置。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `core/pages/index.ts` | PageSurface 抽象：页单元类型 + globalPageIndex→{chapterId, localPageIndex} 解析（复用 chapter-buffer 换算），零 React 依赖 |
| `core/flip/index.ts` | 覆盖动画纯函数：resolveCoverLayers / getCoverMovingTranslateX / 提交回弹终点 / resolveCoverDragTurn（包装 resolveGlobalDragTurn），零 React 依赖 |
| `components/content/paged/PagedReader.tsx` | 覆盖模式阅读器：分层渲染、覆盖补间状态机、动画期缓冲锁、两阶段跨章转正、章首末按钮、首屏遮罩 |
| `components/content/paged/PageSurfaceView.tsx` | 单页容器：页尺寸 overflow:hidden 盒 + 切片 translateX，可承载规范流或克隆；COVER_TRANSITION_MS=280 |
| `components/content/paged/usePageClones.ts` | 克隆生命周期：showClone/clearClone + cloneNode(true) 注入宿主 |
| `components/content/paged/paged-reader.css` | 页容器堆叠/隐藏测量区/移动页分界缘 10px 单条渐变阴影/克隆层禁交互 |
| `components/content/ReaderContent.tsx` | 按 flipMode 分发 cover→PagedReader / slide→HorizontalReader / vertical→VerticalReader（simulation 按 cover 兜底） |
| `hooks/useTouchFlip.ts` | 新增可选 `onTurnPage` 覆写点；轴锁定/阈值/阻尼/捕获逻辑不动 |
| `hooks/usePagination.ts` | scheduleRepaginate 与 silentExpand watcher 增加 flipAnimating 动画锁 |
| `store/settings-store.ts` | ReaderSettings 增加 flipMode；resolveFlipMode/normalizeSettings 处理旧 persist 迁移；horizontalEnabled 派生保留 |
| `store/reading-store.ts` | 新增 flipAnimating 高频 slice |
| `components/settings/SettingsPanel.tsx` | 翻页四档：覆盖/平移/上下滚动/仿真（置灰 + 敬请期待），沿用分段控件样式 |

## 覆盖动画模型

- 左滑（next，direction=1）：底层=下一页克隆（z=1 静止），顶层=当前页（z=2）`translateX = clamp(dragOffset, -pageWidth, 0)` 滑出；提交补间到 `-pageWidth` 后 `setGlobalPageIndex(+1)`。
- 右滑（prev，direction=-1）：底层=当前页（z=1 静止），顶层=上一页克隆（z=2）`translateX = clamp(-pageWidth + dragOffset, -pageWidth, 0)` 滑入；提交补间到 0。
- 回弹：补间回静止位（next→0 / prev→-pageWidth / 首末页阻尼→0），页码不变。
- 阴影：移动页右侧外阴影（`.paged-reader__page--moving` 的 box-shadow，渲染在页盒外不受 overflow:hidden 裁剪，投影落在静止页上），随移动页位移；平移模式 track repeating-gradient 阴影保留不动。
- 提交/回弹判定复用 `resolveGlobalDragTurn`（阈值 DRAG_THRESHOLD=40），时长/缓动 280ms ease-out，首末页沿用 `applyGlobalDragResistance` 阻尼。
- 快速连滑/连点：补间未落幕又来新手势（首个 move）或新提交时，当前动画无过渡落定（提交即完成、回弹即归位），手势立即接管；转正遮盖收尾被新拖拽打断时取消撤克隆，避免误删新克隆。
- 右滑前缘锚定手指：上一页前缘恒等于手指 clientX（`dragStartX` slice + `getCoverMovingTranslateX` 可选参数），按下即从手指处出现跟随，对齐掌阅。
- 时序漏洞修复（usePagination.rebalanceBuffer 排队补跑）：跨章提交动画（280ms）使 rebalance 恰好卡在邻居章 fetch 完成前空转，fetch 完成触发的 scheduleBufferRebalance 撞上 isRebalancing 被丢弃，导致该章永远 merge 不进 buffer（短章后无法翻页）。改为撞上时排队、当前 rebalance 结束补跑，平移/覆盖两模式共用受益。
- 死窗口消除（useChapterBuffer effect#2 rangeKey 变化分支立即 merge）：窗口滑动后已就绪内容不再干等 rebalance 周期，merge 后 rebalance 测量循环下一轮重试即测到（updatePagination 读 live buffer），首次翻页即时生效（实测落地短章 450ms 内邻居章已完成 merge+测量）。
- 跟手帧纪律：dragOffset 继续走 reading-store 独立 slice，PagedReader 订阅后映射为移动页 transform，补间仅「开始/started/落幕」三次 setState。

## 兼容性清单（回归核查）

- 划线/批注显示与新建：作用对象仍为规范流本体（bodyMap 只注册真实 body，克隆不注册）✅
- 点击划线/批注角标：`[data-segment-id]` 保留在当前页容器与隐藏流包裹层 ✅
- 单次选区不跨页：克隆层 pointer-events:none + inert，选区天然限制在当前页容器内 ✅
- 跨页存量划线：随规范流 mark 克隆按页切片正常显示 ✅
- 目录/书签/笔记/进度跳转、首屏还原：navTarget/useInitialPositionRestore 走 reader-dom-store 的 body/viewport 注册，PagedReader 同样注册，零改动 ✅
- 试读提示/富媒体点击/TTS 跟随：复用 useTrialEndTip/useContentRichMedia；TTS 经 horizontalEnabled 派生（cover 为 true）走横排分支 ✅
- 上下滚动模式：行为完全不变 ✅
- 平移模式：HorizontalReader 零行为改动（仅注释正名）✅

## 仿真翻页预留（下期接入点）

- `core/pages` 的 PageSurface（`key/chapterId/localPageIndex/globalPageIndex`）即 page-flip 的页级渲染接口；
- `PageSurfaceView` 是页单元的 DOM 载体，page-flip 可接管其 transform/层级；
- `CoverLayerPlan.movingOnTop` 字段为仿真分层预留；
- 设置面板「仿真」档位已占位（disabled），启用后 ReaderContent 增加分发分支即可。

## 验证

- `vitest run`：18 文件 195 测试全绿（含新增 flip/pages/settings-flip-mode 单测 33 枚）；
- `oxlint`：改动范围 0 error，4 warning 均为预存；
- `tsc -b`：无新增类型错误（存量错误与本 phase 无关）。
