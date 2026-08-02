# Phase 7 — Epub Adapter（子 Agent G）

> 执行者：子 Agent G。前置：Phase 0 done（types 冻结）。可与 Phase 2 并行。产出 epub.js → 统一契约适配层。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§4 全部数据契约、§5 Props 形态）
3. old-vue-reader/prd/接口案例.md（H5 端契约，adapter 输出须与之同形）
4. epubjs 文档（已安装）

## 任务清单

### 1. packages/epub-adapter/src/adapter.ts
- loadEpub(url | ArrayBuffer): Promise<ChapterMeta[]>
  - 解析 EPUB → TOC → ChapterMeta[]（id 稳定、chapterName、index）
- getChapterContent(chapterId): Promise<ChapterContent>
  - 渲染指定章节为 HTML 片段
  - hasNext：根据 spine 位置判断
  - baseUrl：相对资源基准
- 资源路径解析（图片/样式相对路径 → 可加载 URL）

### 2. resource-resolver.ts
- 图片/样式相对路径解析
- 确保 WebView 内可正确加载

### 3. 响应预取
- 暴露 prefetch(chapterIds[]) 供宿主 onPrefetch 调用

### 4. 输出契约对齐
- ChapterMeta / ChapterContent 字段与 §4 完全一致
- posInfo / domPos 锚点：EPUB 端用 CFI 还是沿用 posInfo 体系？
  - 决策：EPUB 端标注锚点用 epub.js CFI，但通过 adapter 转换为统一 domPos 字符串，保证 reader 引擎层无感知
  - 若 EPUB 端无标注能力，本期只做阅读，标注留空（在自查报告登记）

### 5. apps/h5-demo 集成
- EPUB 模式切换（本地文件 vs API）
- 同一 Reader 组件，切数据源行为一致

## Vue 对照自查表

- [ ] ChapterMeta 字段与 §4 一致（id/chapterName/wordCount/tag/isOrder/anchorId/index；EPUB 无 tag/isOrder 时填默认值）
- [ ] ChapterContent 字段与 §4 一致（chapterId/chapterName/html/hasNext/pageButton/baseUrl）
- [ ] 同一 Reader 组件切 API / EPUB 行为一致
- [ ] 标注锚点跨源可用（或已登记本期 EPUB 不支持标注）
- [ ] 资源路径解析后图片/样式可加载

## 交付物

- packages/epub-adapter/src/*
- apps/h5-demo EPUB 模式切换示例
- 自查报告

## 验收（总架构师）

- 切数据源（API / EPUB）行为一致
- 输出类型与 §4 严格匹配（tsc 通过）
- 资源加载正确
- 标注锚点跨源策略已明确（支持或登记）
