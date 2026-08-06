# 迁移状态看板

> 总架构师维护。每 Phase 验收后更新。

| Phase | 子 Agent | 状态 | 验收要点 |
|---|---|---|---|
| 0 monorepo 基建 | 总架构师 | ✅ done | 三包构建通过 / types 冻结 / dev HTTP200 / reader 包零 fetch |
| 1 引擎纯函数 | A | ✅ done | 10 文件 120 测试 / core 零 React 依赖 / 常量逐字对照 / posInfo 字节级兼容（真实数据） |
| 2 阅读引擎 UI | B | ✅ done | 11 文件 140 测试 / reading-store 独立 slice + 细粒度 selector / DRAG_THRESHOLD=40 / 点击分区 20%/80% / hasNext 置灰 / 横划方案=用户批准偏离（横划封顶+显式按钮切章，非 Vue buffer 边界自动切章） |
| 3 壳层设置目录 | C | ✅ done | 7 插槽锚点全接 / 0.28s 动画 / 字号6档字重3档 / 目录 PAGE_SIZE=50+付费拦截+书封 / 边界纯净 / reader tsc 干净（架构师补 vite-env.d.ts 修 CSS 导入类型） |
| 4 选中划线批注 | D | ✅ done | 144 tests / 长按450ms / pending+clientId reconcile / DOM先于回调 / shouldBlockFlip / login拦截 / rollback函数备妥待 Phase 8 接线 |
| 5 笔记中心书签进度 | E | ✅ done | 144 tests / NotesPopup 三Tab+跳转 / TopBar精确snapshot / bookmark pending by id / 800ms+30s reporter / ReadLoginTip / initialPosition / showBookmarkBadge |
| 6 TTS | F | ✅ done | 144 tests / fire-and-forget onTtsAudioRequest + ttsAudioUrl bridge / 7 UI 组件 / allowTts 门控 / TopBar+Settings 中断 / 黑灰主题对齐 |
| 7 Epub Adapter | G | ✅ done | epub-adapter 完整实现 + 13 tests / sample.epub / h5-demo 三模式 / Kindle #fragment 修复 / reader 跨 Phase parity（goChapter/silentExpand/rebalance）已裁定 |
| 8 H5 宿主 API | H | ✅ done | api/* + ReaderHost + 路由 /book/:id/read / thoughts 占位 / dev/epub / USE_MOCK 默认 true / clientId reconcile + annotationFailure rollback 闭环 / TTS ttsAudioUrl 闭环 / getFetchWidth 接线 / reader 零 fetch |
| 9 收尾验收 | I | ✅ done | 富媒体 overlays / book-css 接入 / 随感 h5-demo 1:1 / 插槽文档 / README / 162 tests / 视觉以 Vue SCSS+smoke 替代 PNG |
| 10 真分页与覆盖翻页 | 总架构师 | ✅ done | 掌阅级覆盖模式 / PageSurface 抽象 / 克隆页 / 两阶段跨章转正 / flipMode 四档迁移 / 动画期缓冲锁 |
| 11 性能与物理翻页 | 总架构师 | ✅ done | 拖拽热路径旁路 React（命令式 transform + rAF 合帧）/ 弹簧积分器 + fling / LRU HTML 缓存 + 布尔选择器 / 207 tests / 满帧 60fps / 覆盖模式长按选区修复 |
| 14 仿真翻页 | 总架构师 | ✅ done | 方案 B 自研 CurlRender / 几何核与 page-flip 原版逐位对拍（14 组 oracle）/ dragPoint 二维跟手 + 折角点路径弹簧 / 双阴影层叠 / 首末页阻尼折角 / 设置四档全解锁 / 255 tests 全绿 |

## 契约裁定记录

- Phase 1 Q1 chapter-nav 按钮：归 Phase 2（阅读引擎 UI）渲染，core 只保留 HTML 包裹 + 按钮常量。✅ 裁定：Agent A 现状正确
- Phase 1 Q2 reader-auth 范围：core 只存文案常量，登录拦截由宿主响应 `onLoginRequired` + 壳层触发（Phase 3/4/6）。✅ 裁定：正确
- Phase 1 Q3 TtsEngine DI：`fetchTtsAudioRaw`/`reportReadTime` 改构造注入符合契约 §6，Phase 6 桥接为 `onTtsAudioRequest` + `ttsAudioUrl` 队列。✅ 裁定：正确，正是预期架构
- Phase 1 Q4 tts-state 拆分：`attachTtsState`（Vue 响应式专属）不移植，Phase 6 用 zustand 包装纯 state/mutations。✅ 裁定：正确
- Phase 1 Q5 book-css NBSP 清洗：CSS 选择器中 NBSP 与普通空格等价，清洗可接受；要求 `book-css/rules.ts` 顶部注释标明清洗来源，Phase 9 视觉验收对照 book CSS 渲染。✅ 裁定：可接受
- Phase 2 Q1 initialPosition 还原：归 Phase 5（与 onReadingPositionChange 上报同属阅读进度链路，复用 ReadingPositionReporter + createReadingSnapshot 的 DOM 测量机制），不归 Phase 9。Phase 2 的 navTarget 预留正确。✅ 裁定：归 Phase 5 接线
- Phase 2 Q2 横划模式章首/章末按钮：Vue 源码（index.vue:45-65 竖滚分支 + line 278/281 `!horizontalEnabled`）横划模式显式隐藏此按钮，Vue 横划切章靠 buffer 边界自动 onChapterChange（reader-context.js ensureChapterBuffer:1134）。但用户已明确要求横划用「其他方案」（横划封顶 + 显式按钮切章，useTouchFlip.ts:85 turnPage 封顶 + HorizontalReader.tsx:198-233 按钮调 onChapterChange），属用户批准的偏离，非「源码优先」纠正范围。✅ 裁定：撤回整改，按钮保留；横划方案为用户批准偏离，记录在案
- Phase 3 Q1 ReaderProps.navigate：ReaderSlotCtx.navigate 需注入源，ReaderProps 未暴露。✅ 裁定：契约补缺，已回写 ReaderProps 加 `navigate?: (path: string) => void`（types/props.ts + 00-总览与契约 §5）
- Phase 3 Q2 BookMeta.allowTts：Vue ToolBar 用 `bookMeta.allowTts !== false` 控制 TTS 入口显隐，契约缺。✅ 裁定：parity 补缺，已回写 BookMeta 加 `allowTts?: boolean`（默认 true，types/index.ts + 00-总览与契约 §4）
- Phase 3 Q3 BookMeta.chapterCount：Vue CatalogPopup 用 chapterCount 作总章数。✅ 裁定：不加。契约 §5 规定 chapterList 全量注入，用 `chapterList.length` 即可；若未来部分注入场景再 revisit
- Phase 3 跨 1 ui-store ActivePanel 'font'：Phase 0/1 设的 ActivePanel 漏 'font'，Agent C 加性补缺（非破坏）。✅ 确认：补缺有效，向后兼容
- Phase 3 跨 2 TopBar 书签 stub：best-effort domPos/summary，精确依赖 Phase 5 bookmark-store + reading-position 快照。✅ 裁定：可接受 stub，Phase 5 替换
- Phase 3 跨 3 BookshelfBtn showAddShelf：Vue 用 `showAddShelf && !inBookshelf`，契约 ReaderUser 仅 inBookshelf。✅ 裁定：当前 `!inBookshelf` 可接受；若 Vue showAddShelf 证明是 per-book 实际门控，Phase 9 视觉验收时补到 BookMeta
- Phase 3 跨 4 TTS 离开确认 hook：TopBar.handleBack + SettingsPanel.setHorizontalEnabled 留注释。✅ 裁定：Phase 6 接 confirmTtsLeaveReader + stopTtsSession
- Phase 3 跨 5 navigateToChapter 依赖 useChapterBuffer effect #3（chapterId 变化触发 shouldRebalanceBuffer）。✅ 裁定：确认为稳定契约，Phase 2 后续重构须保留
- Phase 3 基建修正（架构师）：reader 包缺 CSS 模块声明，tsc 报 6 处 `import './x.css'` 类型错误（潜伏自 Phase 2，build=vite build 不跑 tsc 未暴露）。已加 `packages/reader/src/vite-env.d.ts`（`/// <reference types="vite/client" />`）修复，reader tsc 现干净
- Phase 4 Q1 API 失败 rollback 未端到端接线：Vue try/catch 同步 rollback；React rollbackSaveLine/Erase/Note/LineColor 已实现并 export，主路径 fire-and-forget，失败回滚归 Phase 8 宿主 `onAnnotationError` 回调驱动 reader 侧 rollback。✅ 裁定：Phase 4 主链路可批准；Phase 8 必须验收 rollback 闭环 + h5-demo mockLineShouldFail UI 开关
- Phase 4 Q2 Toast 归属：ui-store.showToast + Toast.tsx 全局挂载，不新增 types 字段。✅ 裁定：可接受，与 Vue Toast 行为对齐
- Phase 4 Q3 handleLineColorChange 写 pending：Vue 直接 upsertChapterLine 无 pending 桶；React 改色也 addPendingLine 以便 reconcile。✅ 裁定：可接受，merge 逻辑 props 优先不重复渲染
- Phase 4 Q4 批注删除 / AnnotationListPopup 删除交互：列表 UI 已有，删除属 Phase 5/8 笔记中心 + 宿主 API。✅ 裁定：Phase 4 范围不含删除，defer
- Phase 4 Q5 server webLineId 与 clientId 不一致 renameLineMarkId：Vue handleSaveLine:2291-2300 有 DOM rename；React reconcile 仅清 pending，renameLineMarkId 已 export 未接主路径。✅ 裁定：Phase 8 宿主回写时若 server 换 id，须 props 带 clientId + reader 内 renameLineMarkId 或 props 直接换 key
- Phase 4 跨 1 chrome.css 全局 tap-highlight：合并禁用点击蓝 flash，影响壳层按钮。✅ 裁定：parity 正确，Vue 同类处理
- Phase 4 跨 2 设计图 6 张 PNG：repo 无 prd/design/。✅ 裁定：defer Phase 9 视觉验收，以 Vue SCSS 端口为准
- Phase 5 Q1 BookmarkItem.time：LineItem/NoteItem 已有 `time?: string`，BookmarkItem 漏字段但 Vue 列表展示 time。✅ 裁定：parity 补缺，已回写 BookmarkItem 加 `time?: string`（types/index.ts + 00-总览 §4）
- Phase 5 Q2 readTip 放 ui-store：低频 UI 态；syncTrialEndTip 在 hook 组合 reading-store。✅ 裁定：正确
- Phase 5 Q3 书签 reconcile 按 id 非 clientId：与 §7 划线/批注不同，bookmark-store.reconcileBookmarks 按 props id 匹配清 pending。✅ 裁定：正确，plan 已明确
- Phase 5 Q4 书签/批注删除 API 失败 rollback：fire-and-forget + try/catch 同步路径；宿主未回写时 pending 残留。✅ 裁定：与 Phase 4 一致，Phase 8 闭环 onAnnotationError
- Phase 5 Q5 reader-dom-store：TopBar/Reporter/NavTarget 共享 DOM 桥接，避免 props drilling。✅ 裁定：可接受架构扩展
- Phase 5 跨 1 Phase 3 TopBar stub 已替换：useBookmarkActions + buildReadingSnapshot。✅ 确认完成
- Phase 5 跨 2 Phase 2 initialPosition 已接线：useInitialPositionRestore + navTarget applier。✅ 确认完成
- Phase 5 跨 3 domPos-only navTarget 简化：measureUntilStable 重试链简化，极端场景 Phase 9 对照。✅ 裁定：可接受 defer
- Phase 6 Q1 tts-actions 全局单例：ToolBar/TopBar/CatalogPopup 跨层调用 session 动作，多 Reader 实例会冲突。✅ 裁定：单实例宿主可接受；多实例需求 Phase 9+ 改 Context
- Phase 6 Q2 timeoutMode `'lecture'` vs store `'end'`：Vue tts-state 内部 lecture 映射 end，React TtsTimeoutPopup isActive 对齐。✅ 裁定：可接受
- Phase 6 Q3 h5-demo 无 onTtsAudioRequest→ttsAudioUrl 闭环：仅 mock ttsVoiceTypes。✅ 裁定：Phase 8 宿主集成必验音频闭环
- Phase 6 Q4 computeTtsPlaybackInView 移出 core：避免 core→store 循环依赖。✅ 裁定：正确分层
- Phase 6 跨 1 Phase 3 allowTts + Settings/TopBar hook — 已接线。✅ 确认完成
- Phase 6 跨 2 reader.js bundle ~1MB：TtsEngine+UI 纳入。✅ 裁定：可接受，Phase 9 可评估 code-split
- Phase 6 跨 3 TTS UI 蓝色误用已修：TTS 组件黑灰主题；正文 LINE_COLOR_BLUE 非 TTS 范围保持不变。✅ 确认
- Phase 7 Q1 reader 跨 Phase 修改：原 plan「reader 只读」；EPUB 验收暴露 silentExpand 永不清零、navigateToChapter 未 goChapter、rebalance 与动画抢帧。✅ 裁定：parity 必要修复，批准合入；变更限于 buffer/navigation hooks，types 未动
- Phase 7 Q2 chapterId 策略：spine 1-based + anchorId=href。✅ 裁定：可接受，与 mock API 一致
- Phase 7 Q3 标注 CFI↔domPos：AnchorConverter 预留 noop，lines/notes/bookmarks 空。✅ 裁定：defer Phase 9，报告已登记
- Phase 7 Q4 html 资源：rewriteChapterHtml + data/blob URL + injectImageDimensions。✅ 裁定：正确（reader 不读 baseUrl，须 inline rewrite）
- Phase 7 Q5 Kindle #filepos 内链：prefetch 跳过 .html 文档链、stripUrlFragment。✅ 裁定：正确修复
- Phase 7 跨 1 epub-host 全书 bootstrap：大书启动慢。✅ 裁定：可接受 demo 策略；生产宿主 Phase 8 懒加载 ±1
- Phase 7 跨 2 getFetchWidth 未接线 ReaderContent→useChapterBuffer。✅ 裁定：defer Phase 8/9；Mock 无影响
- Phase 7 跨 3 竖屏 goChapter 仍走 assemble：Vue 竖屏 loadSingleChapter 差异。✅ 裁定：EPUB 竖屏若有问题 Phase 9 单独对齐
- Phase 8 Q1 ReaderProps.annotationFailure：host→reader rollback 触发通道；nonce 递增 + useEffect → rollbackSaveLine/Note + bookmark removePending。✅ 裁定：parity 补缺，已回写 §5 Props + §7 失败分支（types/props.ts AnnotationFailureSignal）
- Phase 8 Q2 getFetchWidth 跨 Phase：ReaderContent 从 reader-dom-store 实测 viewport 传给 onChapterChange/onPrefetch。✅ 裁定：Phase 7 遗留关闭，正确
- Phase 8 Q3 reader 跨 Phase（types + Reader + SelectionLayer ref rollback）：rollback 闭环必要接线，types 仅加性。✅ 裁定：批准，与 Phase 4 Q1 defer 闭环一致
- Phase 8 Q4 USE_MOCK 运行时切换：DevPanel checkbox 展示态，实际需 VITE_USE_MOCK=false + 刷新。✅ 裁定：可接受 demo 限制，defer 生产 env 热切换
- Phase 8 跨 1 epub-host 全书 bootstrap / 标注 defer Phase 9。✅ 裁定：已知遗留，不变
- Phase 8 跨 2 mock-data.ts 保留种子、mock-store 运行时驱动。✅ 确认
- Phase 9 Q1 BookMeta.cssLists/appendCss 未入 types：Vue fetchBookMeta 含外部 CSS 字段；React 用 `BookMeta & HasExternalBookCssInput` 断言 + core/book-css 读取。✅ 裁定：Phase 9 可批准；typed 字段归 post-migration backlog（生产宿主接真实 /read 时加性扩展 BookMeta.cssLists?: unknown; appendCss?: string），不单独开 Phase 10
- Phase 9 Q2 design PNG 不可用：与 Phase 4 裁定一致，以 Vue SCSS 源码端口 + smoke 清单替代 Playwright。✅ 裁定：可接受
- Phase 9 Q3 EPUB 标注 CFI↔domPos 仍为 noop：Phase 7 遗留未扩 scope。✅ 裁定：post-migration backlog
- Phase 9 Q4 epub-host TTS/onLinkClick 最小闭环已做；全书 bootstrap 懒加载仍 defer。✅ 确认
- Phase 9 跨 1 reader bundle ~1MB+（富媒体+book-css）：与 Phase 6 裁定一致，code-split 可选 backlog。✅ 可接受

## 迁移终态

**Phase 0–11、14 全部 done。** Vue 阅读器 → React monorepo 1:1 复刻主链路闭环，性能/手感达第一梯队；仿真翻页（方案 B 自研）已接通。

Post-migration backlog：
- EPUB 标注 CFI、BookMeta.cssLists typed、Playwright 视觉回归、epub-host 懒加载、reader code-split
- 跨章提交瞬间卡顿（~60–230ms）：页容器池化复用/WW 预解析/克隆时机后移等（详见 Phase 11 plan）
- 仿真翻页 T7 增强（可选）：翻过半程"页背面"层（镜像+纸张色罩）、桌面端页角悬停折角预览
- 存量：`useReadingPositionReporter.ts` tsc TS2322（number vs Timeout，非本期引入）
