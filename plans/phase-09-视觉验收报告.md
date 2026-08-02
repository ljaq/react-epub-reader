# Phase 9 视觉验收报告

> 生成：子 Agent I · 2026-08-02

## 设计图走查

| 项 | 结果 | 说明 |
|---|---|---|
| old-vue-reader/prd/design/ PNG | ⚠️ 仓库不可用 | `old-vue-reader/` 已 .gitignore，本地无 `prd/design/` 目录（与 Phase 4 STATUS 裁定一致） |
| 对照基准 | Vue 源码 SCSS + 组件 | ImagePreviewOverlay / FootnotePopover / ThoughtsList / WriteThought 逐行端口 |
| Playwright 截图比对 | 未实施 | 设计 PNG 缺失；未引入 Playwright devDependency（见交付报告 §6） |

## 手动 smoke 项（建议总架构师复验）

| 场景 | 预期 | React 落点 |
|---|---|---|
| 第二章点击图片 | 全屏 #222 预览，点击关闭 | Mock 第二章含 picsum 示例图 |
| 脚注图标点击 | 灰色 Popover + 箭头定位 | `zhangyue-footnote` + `zy-footnote` |
| 正文链接 | `onLinkClick` → 新窗口 | Mock 第二章 `example.com/demo-link` |
| 顶栏更多 → 随感 | 列表 1:1 布局 | `/book/:id/thoughts` |
| 写随感 / 发布 | 发布成功 toast + 返回 | `/book/:id/thoughts/write` |
| 点赞 | 乐观 UI + API | likeThought / cancelThoughtLike |

## 偏差记录

- 书籍 CSS 规则同步依赖 `bookMeta.cssLists` 或 `appendCss`；Mock bookMeta 未含外部 CSS，规则类未激活（与 Vue 无 cssLists 时行为一致）
- EPUB 标注 CFI↔domPos：仍为 noop（Phase 7 已知遗留）

## 截图路径

无自动化截图。建议本地 `pnpm dev` 后手动验收上述 smoke 项。
