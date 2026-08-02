# Phase 3 — 壳层 + 设置 + 目录（子 Agent C）

> 执行者：子 Agent C。前置：Phase 2 done（依赖 ui-store/settings-store/content）。产出壳层 UI、设置/字体面板、目录弹窗、插槽体系。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§5 chromeSlots、§6 onBookDetailClick/onLoginRequired、§8 插槽边界）
3. old-vue-reader/components/ReaderChrome/*（只读对照）
4. old-vue-reader/components/{CatalogPopup,SettingsPanel,FontPanel}/
5. old-vue-reader/prd/cursor-plan/03-阅读器壳层.md、04-设置面板.md、05-字体面板.md、10-目录弹窗.md
6. old-vue-reader/prd/design/{唤起工具栏.png,打开设置.png,打开字体设置.png,打开目录.png}

## 任务清单

### 1. chrome/TopBar
- 左：返回按钮
- 右：未登录「登录」→ onLoginRequired('auth')；已登录「更多」下拉
- 更多菜单：「添加书签」→ 触发 onBookmarkCreate 流程；chromeSlots.topBarMoreMenu 渲染插槽（随感等由宿主注入，reader 不内置）

### 2. chrome/BottomBar
- 第一层 ChapterProgress：章节进度条（拖动/点击切章）+ 左右切章按钮 → onChapterChange
- 第二层 ToolBar：目录/设置/语音朗读/字体/笔记五入口 → setActivePanel
- 激活态样式对照设计图

### 3. chrome/BookshelfBtn
- 右上「加入书架」，未加入时显示 → onBookshelfAdd(bookId)

### 4. chrome/ReaderChrome
- 整合 TopBar/BookshelfBtn/ChapterProgress/BottomBar/ToolBar
- visible 态 + CSS 动画显隐（顶栏下坠、底栏上涌、书架右→左），动画 0.28s
- 悬浮定位，不占文档流

### 5. settings/SettingsPanel
- 亮度 / 护眼 / 主题（四主题）/ 行距 / 翻页方式（横划/竖滚）→ settings-store
- 翻页方式切换需中断 TTS（Phase 6 接，此处留 hook）

### 6. settings/FontPanel
- 字号 6 档 + 字重三档 → settings-store

### 7. popups/CatalogPopup
- 分页目录、付费章拦截（chapterAccess[id].needPurchase → onLoginRequired('paid')）
- 书封点击 → onBookDetailClick(bookId)
- 对照 CatalogPopup/index.vue（606 行）逐屏复刻

### 8. 插槽体系
- 实现 ReaderChromeSlots 7 个锚点：topBarLeft/topBarRight/topBarMoreMenu/toolbarExtra/contentOverlay/bottomExtension/rootOverlay
- ReaderSlotCtx 注入 bookId/chapterId/navigate

## Vue 对照自查表

- [ ] 点击中央 20%-80% 唤起/隐藏 UI（动画 0.28s）
- [ ] 顶栏：返回、登录、更多（书签 + 插槽项，不含内置随感）
- [ ] 底栏：章节进度条 + 五入口工具栏
- [ ] 设置面板不遮底栏五图标
- [ ] 四主题 + 亮度 + 护眼 + 行距
- [ ] 字号 6 档 + 字重三档
- [ ] 横划/竖滚切换 localStorage 持久化
- [ ] 目录：分页、付费章拦截、书封点击
- [ ] 视觉对照 唤起工具栏.png / 打开设置.png / 打开字体设置.png / 打开目录.png
- [ ] chromeSlots.topBarMoreMenu 渲染宿主注入项，reader 无随感代码

## 交付物

- packages/reader/src/components/{chrome,settings,popups/CatalogPopup}/*
- 插槽类型与渲染
- 自查报告

## 验收（总架构师）

- 点击中央唤起/隐藏动画 0.28s
- 设置持久化（刷新仍在）
- 目录跳转触发 onChapterChange
- 付费章拦截触发 onLoginRequired
- 插槽注入随感菜单项可渲染（h5-demo 侧 mock）

## 源码对应关系（只读对照，源码是真理）

### 壳层组装 → components/ReaderChrome/index.vue（52 行，全文）
- TopBar/BookshelfBtn/ChapterProgress/BottomBar/ToolBar 整合；`visible` prop + CSS 动画显隐

### TopBar → components/ReaderChrome/TopBar/index.vue（416 行）
- 左返回 / 右登录 / 更多下拉；更多菜单「添加书签」+ 随感（Vue 内置，React 改为插槽）
- 对照：登录态、更多菜单项结构

### BottomBar → components/ReaderChrome/BottomBar/index.vue（68 行）
- 第一层 ChapterProgress、第二层 ToolBar 容器

### ChapterProgress → components/ReaderChrome/ChapterProgress/index.vue（415 行）
- 章节进度条（拖动/点击切章）+ 左右切章按钮 → goChapter/nextChapter/prevChapter
- **不展示**章序文案（以设计图 唤起工具栏.png 为准）

### ToolBar → components/ReaderChrome/ToolBar/index.vue（208 行）
- 五入口：目录/设置/语音朗读/字体/笔记 → setActivePanel
- 激活态样式

### BookshelfBtn → components/ReaderChrome/BookshelfBtn/index.vue（130 行）
- 右上「加入书架」未加入时显示

### SettingsPanel → components/SettingsPanel/index.vue（616 行，全文）
- 亮度/护眼/四主题/行距/翻页方式；翻页方式切换中断 TTS（留 hook 给 Phase 6）

### FontPanel → components/FontPanel/index.vue（548 行，全文）
- 字号 6 档 + 字重三档

### CatalogPopup → components/CatalogPopup/index.vue（605 行，**全文逐屏复刻**）
- 分页目录、付费章拦截、书封点击
- 你当前 IDE 已打开此文件，可作主参考

### 设计图（old-vue-reader/prd/design/）
- 唤起工具栏.png、打开设置.png、打开字体设置.png、打开目录.png

### 注意
- Vue TopBar「更多」菜单内置随感；React 改为 `chromeSlots.topBarMoreMenu` 渲染插槽，reader 不内置随感路由
- Vue 随感跳转 `$router.push('/book/:id/thoughts')`；React 由 ReaderSlotCtx.navigate 注入
