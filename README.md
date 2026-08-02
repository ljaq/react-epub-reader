# react-epub-reader

基于 React 的富文本阅读器组件，采用**数据无状态、UI 状态内聚**的设计。章节、标注等持久化数据由外部提供；选区、翻页、主题等交互状态由阅读器自行管理，仅在关键节点向外通知。

## 设计理念

| 原则 | 说明 |
|------|------|
| **数据无状态** | 章节列表、章节内容、标注等持久化数据由外部注入，阅读器不请求、不存储 |
| **UI 状态内聚** | 选区、翻页、主题、字号等交互状态由阅读器内部管理，不向外同步 |
| **按需加载** | 阅读器不持有全书章节，仅在需要时向外部请求当前（及预取）章节 |
| **展示优先** | 专注渲染与交互，不承担 EPUB 解析或业务持久化逻辑 |

### 状态边界

```
┌─────────────────────────────────────────────────────────┐
│                    阅读器内部（内聚）                      │
│  选区 · 翻页动画 · 主题/字号 · 工具栏 · 章节 UI 缓存       │
└─────────────────────────────────────────────────────────┘
         ▲ 注入                            │ 关键节点回调
         │                                  ▼
┌─────────────────────────────────────────────────────────┐
│                    外部宿主（驱动）                        │
│  章节列表 · 章节内容 · 标注数据 · 持久化 · 鉴权            │
└─────────────────────────────────────────────────────────┘
```

**向外通知的关键节点**（示例）：

- 章节切换（`onChapterChange`）— 触发外部加载新章节
- 标注完成（`onAnnotationCreate` / `Update` / `Delete`）
- 预取请求（`onPrefetch`）— 提示外部提前加载相邻章节
- 链接点击（`onLinkClick`）— 内部跳转或外部处理

不向外部同步：滚动过程、选区变化中间态、主题切换过程等高频 UI 状态。

## 架构总览

阅读器本体只关心**统一的数据契约**和**事件回调**，不关心数据来自 API 还是 epub.js。

```
                    ┌──────────────────────┐
                    │  react-epub-reader   │
                    │  （渲染 + 交互）       │
                    └──────────┬───────────┘
                               │ 统一契约（Props / Events）
              ┌────────────────┴────────────────┐
              ▼                                 ▼
     ┌─────────────────┐              ┌─────────────────────┐
     │  H5 应用         │              │  Epub Adapter       │
     │  （直接对接）      │              │  （原生侧适配层）     │
     │  fetch API       │              │  epub.js → HTML     │
     └────────┬────────┘              └──────────┬──────────┘
              ▼                                 ▼
     ┌─────────────────┐              ┌─────────────────────┐
     │  后端 API        │              │  本地 EPUB 文件       │
     └─────────────────┘              └─────────────────────┘
```

## 适配层

### H5：无需额外适配层

H5 应用直接作为宿主，监听阅读器事件后自行请求数据并注入 Props。

```
阅读器 ──onChapterChange──▶ H5 应用 ──fetch──▶ 后端 API
阅读器 ◀──chapterList / chapter / annotations── H5 应用
阅读器 ──onAnnotationCreate──▶ H5 应用 ──POST──▶ 后端 API
```

H5 侧职责：

- 初始化时注入章节列表（轻量元数据）和当前章节标注
- 响应 `onChapterChange` / `onPrefetch`，请求对应章节内容
- 响应标注事件，调用 API 持久化

> **注意**：后端 API 返回的章节内容须符合统一数据契约（见下文），其角色等价于原生侧的 Epub Adapter 输出，只是实现位置在服务端而非客户端。

### 原生 App：Epub Adapter 适配层

原生 App 持有本地 EPUB 文件，需要一层 **Epub Adapter**（基于 epub.js）将 EPUB 结构转换为阅读器可消费的数据格式。

```
阅读器 ──onChapterChange──▶ Bridge ──▶ Epub Adapter ──▶ epub.js
阅读器 ◀──chapterList / chapter / annotations── Bridge ◀── Epub Adapter
阅读器 ──onAnnotationCreate──▶ Bridge ──▶ 原生持久化
```

Epub Adapter 职责：

| 职责 | 说明 |
|------|------|
| 解析 EPUB | 提取元数据、目录（TOC）、书脊（Spine） |
| 输出章节列表 | 转换为统一的 `ChapterMeta[]`，生成稳定的 `chapterId` |
| 按需渲染 HTML | 根据阅读器请求，将指定章节渲染为 HTML 片段 |
| 资源路径处理 | 解析图片、样式等相对路径，确保 WebView 内可正确加载 |
| 响应预取 | 收到 `onPrefetch` 后提前渲染相邻章节，减少翻页等待 |

Epub Adapter **不负责**：阅读 UI、标注渲染逻辑、主题/字号（由阅读器管理）。

#### 按需加载流程

阅读器不持有全书内容，只维护当前章节的 UI 缓存：

```
1. 初始化：注入 chapterList（元数据）+ 当前 chapterContent + annotations
2. 用户翻页至章节边界 → onChapterChange(chapterId)
3. 宿主 / Adapter 加载该章节 → 注入新 chapterContent
4. 阅读器渲染，同时发出 onPrefetch([prevId, nextId])
5. 宿主 / Adapter 预渲染相邻章节，用户翻页时直接注入
```

## 统一数据契约

H5 API 与 Epub Adapter 须输出相同结构，避免双端标注、链接行为不一致。

```ts
// 章节元数据（轻量，初始化时全量注入）
interface ChapterMeta {
  id: string        // 稳定 ID，与锚点、标注关联
  title: string
  index: number
}

// 章节内容（按需注入，每次一个）
interface ChapterContent {
  id: string
  html: string      // 渲染用 HTML 片段
  baseUrl?: string  // 相对资源（图片等）解析基准
}

// 标注
interface Annotation {
  id: string
  chapterId: string
  type: 'highlight' | 'underline'
  anchor: string    // 锚点格式待定（CFI / 文本偏移 + 上下文）
  color?: string
  note?: string
}
```

## 数据流

**输入（外部 → 阅读器）**

- `chapterList: ChapterMeta[]` — 目录，初始化时注入
- `chapter: ChapterContent` — 当前章节内容，按需更新
- `annotations: Annotation[]` — 当前章节的标注数据

**输出（阅读器 → 外部）**

- `onChapterChange(chapterId)` — 章节切换，请求加载
- `onPrefetch(chapterIds)` — 预取相邻章节
- `onAnnotationCreate / Update / Delete` — 标注变更
- `onLinkClick(href)` — 链接点击

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建
pnpm build
```

## 技术栈

- React 19
- TypeScript
- Vite

## 开发计划

- [ ] 统一数据契约（TypeScript 类型定义）
- [ ] 阅读器核心组件与 Props / 回调接口
- [ ] 章节按需加载与 UI 缓存
- [ ] 划线、高亮交互与锚点方案
- [ ] Epub Adapter（epub.js 封装）
- [ ] H5 集成示例
