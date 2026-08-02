# Phase 0 — Monorepo 基建（总架构师亲自执行）

> 执行者：总架构师。完成后解锁 Phase 1/7/8 启动。

## 目标

搭建 pnpm monorepo 三包骨架，冻结 types/，确保 dev/build/test 可跑。

## 任务清单

### 1. pnpm-workspace.yaml
- packages/* 与 apps/*

### 2. 三包结构
- packages/reader：package.json（name=@react-epub-reader/reader）、tsconfig、vite library mode 构建配置、src/ 目录树按 00-总览与契约 §2 创建空目录与 .gitkeep
- packages/epub-adapter：package.json（@react-epub-reader/epub-adapter）、src/{adapter.ts,resource-resolver.ts,index.ts} 空壳
- apps/h5-demo：package.json（@react-epub-reader/h5-demo）、vite dev 入口、src/{api,host,routes,slots,App.tsx,main.tsx}

### 3. 根配置
- 根 package.json：scripts（dev → apps/h5-demo、build → 三包、test → vitest）、devDependencies 共享（vite/vitest/typescript/@types）
- tsconfig.json references 三包
- 旧 src/（Vite 默认 Demo）迁移到 apps/h5-demo 或删除

### 4. 冻结 types/
- packages/reader/src/types/index.ts 严格按 00-总览与契约 §4 实现 TS 类型
- 导出所有 interface/type

### 5. reader 包导出空壳
- packages/reader/src/index.ts 导出 Reader（占位）、所有 types
- packages/reader/src/components/Reader.tsx 占位组件（接受 ReaderProps，渲染 null）

### 6. vitest 配置
- 根 vitest.config.ts，packages/reader 单测目录 src/core/__tests__/

## 交付物

- pnpm-workspace.yaml / 三包 package.json / 根 tsconfig / vitest.config
- packages/reader/src/types/ 完整冻结
- packages/reader 目录树（空文件占位）

## 自查表

- [ ] pnpm install 无错
- [ ] pnpm -w dev 启动 apps/h5-demo（空白页可接受）
- [ ] pnpm -w build 三包构建通过（reader library mode 产出 dist）
- [ ] pnpm -w test 通过（无单测也返回 0）
- [ ] packages/reader/src/types/ 与 00-总览与契约 §4 逐字段对照一致
- [ ] reader 包内无 fetch / 无 react-router 引用

## 完成后

- 通知总架构师（自己）验收
- 解锁 Phase 1（A）、Phase 7（G，可并行）、Phase 8（H，开始搭 mock）

## 源码对应关系（types 冻结依据）

types/ 字段严格对齐 old-vue-reader 真实返回，不要照 Vue plan 文档（可能偏旧）：
- ChapterMeta 字段来源：old-vue-reader/prd/接口案例.md 第 242–278 行（/chapter 列表项：chapterName/id/wordCount/jumpUrl/tag/isOrder/anchorId）
- ChapterContent 字段来源：接口案例.md 第 1–16 行（/nextchapter：chapterName/html/hasNext/pageButton）
- LineItem 字段来源：接口案例.md 第 40–134 行（/read/line/list：id/webLineId/time/posInfo/summary/underlineColor）
- NoteItem 字段来源：接口案例.md 第 177–241 行（/read/note/list）
- BookmarkItem 字段来源：接口案例.md（搜 getbookmark）+ utils/pos-info.js（encodeBookmarkSummary/decodeBookmarkSummary/generateBookmarkId）
- ChapterAccess：utils/chapter-access.js（10003 needLogin、10004 needPurchase；checkread 返回 allFree/isFree/isLogin）
- posInfo/domPos 锚点格式：utils/pos-info.js 全文（291 行），字节级沿用
