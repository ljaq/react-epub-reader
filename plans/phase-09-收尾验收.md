# Phase 9 — 收尾与视觉验收（子 Agent I）

> 执行者：子 Agent I。前置：Phase 1–8 全 done。产出富媒体、书籍 CSS、随感示例、插槽文档、视觉验收。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§8 插槽边界）
3. old-vue-reader/components/{ImagePreviewOverlay,FootnotePopover,ThoughtsList,WriteThought}/
4. old-vue-reader/utils/book-css.js（Phase 1 已移植 core/book-css，此处接入）
5. old-vue-reader/prd/design/ 全部 PNG

## 任务清单

### 1. 富媒体
- overlays/ImagePreviewOverlay：图片预览
- overlays/FootnotePopover：脚注 Popover
- 链接点击 → onLinkClick

### 2. 书籍 CSS 注入
- core/book-css 接入（Phase 1 已移植）
- 章 HTML 注入后套 book CSS，作用域与优先级与 Vue 一致
- 注入点在 Phase 2 渲染流程已预留，此处补全规则

### 3. 随感示例（仅 h5-demo）
- apps/h5-demo/routes/thoughts/ThoughtsList + WriteThought
- apps/h5-demo/slots/ThoughtsMenuItem（注入 chromeSlots.topBarMoreMenu）
- 随感 UI 1:1 对齐 Vue（即便在宿主侧）
- reader 包零随感代码

### 4. 插槽文档
- packages/reader/README 或 docs：chromeSlots 用法、乐观 UI 时序图
- 示例：随感入口注入

### 5. 视觉验收
- 对照 old-vue-reader/prd/design/ 全部 PNG 逐屏走查
- 建议工具：Playwright 截图比对（旧 Vue 跑 mock vs 新 React 跑 mock，同章同设置）
- 15+ 张设计图 parity 检查

### 6. 更新 README
- react-epub-reader/README.md 开发计划勾选
- 同步 README 契约与 00-总览与契约.md 一致

## Vue 对照自查表

- [ ] 图片预览交互与 Vue 一致
- [ ] 脚注 Popover 与 Vue 一致
- [ ] 链接点击触发 onLinkClick
- [ ] 书籍 CSS 注入后样式与 Vue 一致
- [ ] 随感列表/写随感/点赞 1:1 对齐 Vue
- [ ] 随感入口通过 chromeSlots.topBarMoreMenu 注入
- [ ] reader 包无随感代码（grep 'thought' 验证）
- [ ] 全部 design PNG 走查通过
- [ ] README 开发计划勾选

## 交付物

- packages/reader/src/components/overlays/{ImagePreviewOverlay,FootnotePopover}/*
- apps/h5-demo/src/{routes/thoughts,slots}/*
- 插槽文档
- 视觉验收报告（含截图比对）
- README 更新
- 自查报告

## 验收（总架构师，终验）

- 全部 design PNG 走查 + 各 Phase 验收表全勾选
- reader 包零随感代码
- 插槽文档完整
- README 与契约一致
- pnpm -w build / test 通过
- 无 console error

## 源码对应关系（只读对照，源码是真理）

### 富媒体
- ImagePreviewOverlay → components/ImagePreviewOverlay/index.vue（49 行，全文）
- FootnotePopover → components/FootnotePopover/index.vue（89 行，全文）
- 链接/图片/脚注点击分发 → utils/reader-content-interactions.js（39 行，全文）

### 书籍 CSS（Phase 1 已移植 core/book-css，此处接入渲染）
- utils/book-css.js（85）+ book-css-clear.js（178）+ book-css-rules.js（40）+ book-css-rules.generated.json
- 注入点：Phase 2 渲染流程预留，此处补全规则与优先级

### 随感示例（**仅 h5-demo，reader 零代码**）
- ThoughtsList → components/ThoughtsList/index.vue（462 行，全文复刻到 apps/h5-demo/routes/thoughts/）
- WriteThought → components/WriteThought/index.vue（189 行，全文复刻）
- 入口注入：apps/h5-demo/slots/ThoughtsMenuItem → chromeSlots.topBarMoreMenu

### 随感 API（Phase 8 已迁移 api/thought.ts，此处接入）
- fetchThoughtList / likeThought / cancelThoughtLike / saveThought

### 设计图（**全部 PNG 逐屏走查**）
- old-vue-reader/prd/design/ 全部 15+ 张
- 建议工具：Playwright 截图比对（旧 Vue 跑 mock vs 新 React 跑 mock，同章同设置）

### 文档
- packages/reader README：chromeSlots 用法、乐观 UI 时序图
- 根 README.md 开发计划勾选 + 契约同步 00-总览与契约.md
