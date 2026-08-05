---
name: 恢复横排模式间距到容器级（参考旧 Vue）
overview: "将横排模式左右间距从 p/h1/h2/h3/li 元素级 padding 恢复到 viewport-h 容器级（对齐旧 Vue index.vue:2448 的 `padding: 24px 20px 48px`），同时修复覆盖模式（PagedReader）页容器与隐藏测量流因 viewport padding 导致的偏移。阴影（::after repeating-gradient）无需改动——因 body--columns 无水平 padding，列起点与 ::after 起点重合，gradient 仍与列边界对齐。"
todos:
  - id: restore-viewport-padding
    content: 在 reader-content.css 中新增 --reader-h-pad-x 变量并恢复 viewport-h 水平 padding，同时删除 p/h1/h2/h3/li 的 padding 规则
    status: completed
  - id: fix-paged-positioning
    content: 在 paged-reader.css 中将 .paged-reader__page 和 .paged-reader__hidden-flows 水平内移 var(--reader-h-pad-x) 同步
    status: completed
    dependencies:
      - restore-viewport-padding
  - id: verify-modes
    content: 验证平移模式阴影对齐、覆盖模式翻页无偏移、竖滚模式不受影响
    status: completed
    dependencies:
      - fix-paged-positioning
---

## 用户需求

当前平移模式（slide）的翻页阴影基于 `::after`（reader-content.css:74-92），为做竖直全屏阴影，之前移除了 `.reader-content__viewport-h` 容器的水平间距，改到 `p/h1/h2/h3/li` 元素上（reader-content.css:136-143），导致 `div`/`blockquote` 等非枚举元素无 padding，很多场景间距异常。

## 产品概述

将水平间距定义从 `p/h1/h2/h3/li` 元素恢复到 viewport 容器级（参照旧 Vue 项目 `index.vue:2448` 的 `padding: 24px 20px 48px`），同时保持竖直全屏阴影不被破坏、覆盖模式（cover/PagedReader）翻页不偏移。

## 核心功能

- 恢复 `.reader-content__viewport-h` 的水平 padding（20px），对齐旧 Vue
- 删除 `p/h1/h2/h3/li` 的 `padding-left/right: 20px` 规则
- 覆盖模式的 `.paged-reader__page` 与 `.paged-reader__hidden-flows` 同步内移，使页容器宽度 = pageWidth，消除翻页偏移
- 平移模式阴影 `::after` 无需改动（body 无水平 padding，列起点=0，gradient 自然对齐）
- 竖直全屏阴影保留（`::after` `inset:0` 覆盖 segment 全高，垂直 padding 留在 body--columns）

## 技术栈

纯 CSS 改动，不涉及任何 JS/TS 逻辑变更。

## 实现方案

### 核心思路

引入 CSS 变量 `--reader-h-pad-x: 20px`，定义在 `.reader-content--horizontal`（root 级），三处消费：viewport-h padding、paged-reader page 定位、paged-reader hidden-flows 定位。单变量同步消除硬编码不同步风险。

### 为什么 viewport-h padding 是正确选择（而非 body--columns padding）

- `getReaderContentWidth`（reader-viewport/index.ts:13-25）测量 `viewport.clientWidth - paddingLeft - paddingRight`
- 放 viewport-h：pageWidth = viewport.clientWidth - 2×20px = body content area（body 无水平 padding，填满 segment = track = viewport content area）→ 单列对齐
- 放 body--columns：pageWidth = viewport.clientWidth（viewport 无 padding），但 body content area = viewport - 40px → columnWidth > content area → 多列错乱

### 为什么阴影 ::after 不需要改

- `::after` 的 containing block 是 `.reader-content__segment`（`position: relative`），`inset: 0` 覆盖整个 segment
- body--columns 无水平 padding → 列起点 = body 左缘 = segment 左缘（0）
- gradient 第一道阴影在 `var(--page-width)` 处 = 第一列右缘，对齐
- `background-position: 16px` 是视觉微调偏移，与 padding 位置无关
- 竖直全屏：`::after` `inset:0` 覆盖 segment 全高（`height:100%`），垂直 padding 在 body--columns 上不影响 segment 高度

### 为什么覆盖模式需要修 page 与 hidden-flows

- `.paged-reader__page` `position:absolute; inset:0` 定位相对 viewport-h 的 padding box（包含 padding 的全盒）
- viewport-h 加水平 padding 后，page 仍填满 padding box（全宽），但 pageWidth = 全宽 - 40px → 列右缘距屏幕右侧 40px 空白 → 与平移模式（viewport padding 居中）视觉位置差 20px = 偏移
- 修复：page 与 hidden-flows 都水平内移 `var(--reader-h-pad-x)`，使 page 宽度 = pageWidth，列起点 = viewport content area 左缘 → 两模式一致

### 为什么 hidden-flows 也要改

- `.paged-reader__hidden-flows` 当前 `left:0; width:100%` 填 padding box 全宽
- 内部 body columnWidth = pageWidth（=全宽-40px），但容器宽=全宽 → 多列错乱，scrollWidth 测量错误
- 克隆源 body 在全宽容器内，克隆放进内移后的 page → 列位置错位 = 翻页闪烁
- 修复：hidden-flows 同样内移，使内部 body content area = pageWidth

## 实施备注

- 不改 `usePagination.ts` / `reader-viewport/index.ts` 测量逻辑（已自动适配 viewport padding）
- 不改 `body--columns` 的垂直 padding（保留竖直全屏阴影）
- 不改 `SegmentView` / `PageSurfaceView` 内联样式（CSS 变量与 className 不变）
- 竖滚模式 `.reader-content--vertical .reader-content__body` padding（L145-151）不受影响，不消费 `--reader-h-pad-x`

## 目录结构

```
packages/reader/src/components/content/
├── reader-content.css       # [MODIFY] 恢复 viewport-h 水平 padding、删除 p 标签 padding 规则
└── paged/
    └── paged-reader.css     # [MODIFY] page 与 hidden-flows 水平内移同步
```

### 文件修改详情

**reader-content.css** — 3 处改动：

1. `.reader-content--horizontal`（L20-25）：新增 `--reader-h-pad-x: 20px;` CSS 变量声明
2. `.reader-content__viewport-h`（L38-47）：`padding: 0` → `padding: 0 var(--reader-h-pad-x);`（仅水平，垂直保持 0 由 body--columns 管）
3. 删除 L134-143 整块规则（`p/h1/h2/h3/li { padding-left:20px; padding-right:20px }` 及其上方注释）

**paged-reader.css** — 2 处改动：

4. `.paged-reader__page`（L39-46）：`inset: 0` → `top: 0; right: var(--reader-h-pad-x); bottom: 0; left: var(--reader-h-pad-x);`（水平内移，垂直仍 0）
5. `.paged-reader__hidden-flows`（L17-27）：`left: 0; width: 100%;` → `left: var(--reader-h-pad-x); right: var(--reader-h-pad-x);`（去掉 `width:100%`，用 left/right 双向定位）