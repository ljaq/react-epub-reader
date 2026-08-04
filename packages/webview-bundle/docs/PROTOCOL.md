# WebView Bridge 协议（v1）

`@react-epub-reader/webview-bundle` 构建产物为静态 `index.html + JS + CSS`，嵌入 React Native 或 Flutter WebView 后，通过统一 JSON 协议与 Native App 双向通信。

## 消息信封

```typescript
interface BridgeMessage {
  v: 1
  id?: string       // 可选，request/response 配对
  type: string
  payload?: unknown
}
```

## 通信方向

### App → WebView

Native 调用（注入 JavaScript）：

```javascript
window.__EpubReader.dispatch(JSON.stringify({ v: 1, type: '...', payload: {...} }))
```

| 平台 | 调用方式 |
|------|---------|
| React Native | `webViewRef.injectJavaScript(...)` |
| Flutter webview_flutter | `controller.runJavaScript(...)` |
| Flutter inappwebview | `controller.evaluateJavascript(...)` |

### WebView → App

WebView 自动探测平台并发送 JSON 字符串：

| 平台 | 接收方式 |
|------|---------|
| React Native | `<WebView onMessage={(e) => ...} />` |
| Flutter webview_flutter | `JavaScriptChannel('EpubReaderBridge', ...)` |
| Flutter inappwebview | `addJavaScriptHandler(handlerName: 'EpubReaderBridge', ...)` |

## App → WebView 命令

### `loadEpub`

加载 EPUB 书籍。

```json
{
  "v": 1,
  "type": "loadEpub",
  "payload": {
    "bookId": 1,
    "source": { "kind": "url", "data": "file:///path/to/book.epub" },
    "initialChapterId": 1,
    "initialPosition": { "chapterId": 1, "domPos": "0=1=0=0#0", "precent": 0 },
    "ttsVoiceTypes": [{ "key": "BV102_streaming", "label": "儒雅青年" }]
  }
}
```

`source.kind`:
- `url` — EPUB 文件 URL（推荐：Native 写入沙盒后传 `file://` 路径）
- `base64` — base64 编码的 EPUB 二进制（适合小文件）

### `epubChunk`

大文件分片传输（最后一个 chunk 需带 `loadOptions`）。

```json
{
  "v": 1,
  "type": "epubChunk",
  "payload": {
    "bookId": 1,
    "chunkIndex": 0,
    "totalChunks": 3,
    "data": "<base64 fragment>",
    "loadOptions": {
      "bookId": 1,
      "initialChapterId": 1
    }
  }
}
```

### `loadBook`（API 数据源模式）

App 请求后端后，将书籍元数据、章列表、首章 HTML、标注等一次性注入。WebView **不发起网络请求**。

```json
{
  "v": 1,
  "type": "loadBook",
  "payload": {
    "bookId": 12535542,
    "bookMeta": { "bookId": 12535542, "bookName": "示例书", "author": "作者", "bookPic": "" },
    "chapterList": [{ "id": 1, "chapterName": "第一章", "wordCount": 1000, "tag": "免费", "isOrder": true, "anchorId": "1", "index": 0 }],
    "chapterAccess": { "1": { "chapterId": 1, "canRead": true, "needLogin": false, "needPurchase": false, "isLoggedIn": true } },
    "chapters": { "1": { "chapterId": 1, "chapterName": "第一章", "html": "<p>正文</p>", "hasNext": true, "pageButton": "" } },
    "chapterLoadStates": { "1": "ready" },
    "lines": {},
    "notes": {},
    "bookmarks": {},
    "user": { "isLoggedIn": true, "inBookshelf": false },
    "initialChapterId": 1,
    "initialPosition": { "chapterId": 1, "domPos": "0=1=0=0#0", "precent": 0 }
  }
}
```

要求：`initialChapterId` 对应章的 `chapterLoadStates[id] === 'ready'` 且 `chapters[id].html` 非空。

成功后 WebView 发出 `bookLoaded` 事件。

### `injectChapter`（API 模式按需切章）

响应 `chapterChange` / `prefetch` 事件，App 请求后端后注入单章：

```json
{
  "v": 1,
  "type": "injectChapter",
  "payload": {
    "chapterId": 2,
    "content": { "chapterId": 2, "chapterName": "第二章", "html": "<p>正文</p>", "hasNext": true, "pageButton": "" },
    "access": { "chapterId": 2, "canRead": true, "needLogin": false, "needPurchase": false, "isLoggedIn": true },
    "loadState": "ready"
  }
}
```

加载中可先发 `loadState: "loading"`；失败发 `loadState: "error"`（`content` 可省略）。

### `updateChapterAccess`

付费解锁后批量更新章节权限：

```json
{
  "v": 1,
  "type": "updateChapterAccess",
  "payload": {
    "merge": true,
    "chapterAccess": { "3": { "chapterId": 3, "canRead": true, "needLogin": false, "needPurchase": false, "isLoggedIn": true } }
  }
}
```

### `updateLines`

更新划线（默认增量合并）。

```json
{
  "v": 1,
  "type": "updateLines",
  "payload": {
    "chapterId": 1,
    "merge": true,
    "lines": [{
      "id": 123,
      "webLineId": "abc",
      "clientId": "abc",
      "chapterId": 1,
      "posInfo": { "0=1=7=0#N": 20013 },
      "summary": "划线摘要",
      "underlineColor": "#0080FF"
    }]
  }
}
```

### `updateNotes`

更新批注/高亮（结构同 `updateLines`，字段名为 `notes`）。

### `updateBookmarks`

更新书签。

```json
{
  "v": 1,
  "type": "updateBookmarks",
  "payload": {
    "chapterId": 1,
    "merge": true,
    "bookmarks": [{
      "id": "1_0",
      "chapterId": 1,
      "domPos": "0=1=0=0#0",
      "summary": "书签摘要",
      "precent": 0.1,
      "cur": 1,
      "totalPage": 10,
      "h5PageY": 0,
      "strIdx": 0
    }]
  }
}
```

### `updateUser`

```json
{
  "v": 1,
  "type": "updateUser",
  "payload": { "isLoggedIn": true, "inBookshelf": false }
}
```

### `injectTtsAudio`

TTS 音频回注（响应 `ttsAudioRequest` 事件）。

```json
{
  "v": 1,
  "type": "injectTtsAudio",
  "payload": {
    "reqId": "req-001",
    "url": "https://example.com/audio.mp3",
    "text": "朗读文本",
    "voiceType": "BV102_streaming"
  }
}
```

### `signalAnnotationFailure`

标注保存失败，触发 WebView 内 DOM rollback。

```json
{
  "v": 1,
  "type": "signalAnnotationFailure",
  "payload": {
    "clientId": "webLineId-xxx",
    "type": "line",
    "chapterId": 1
  }
}
```

### `navigateThoughts`

随感 UI 切换（Phase 1 由 App 侧实现 UI，WebView 仅响应 screen 切换）。

```json
{
  "v": 1,
  "type": "navigateThoughts",
  "payload": { "screen": "list", "thoughts": [] }
}
```

### `destroy`

卸载当前书籍，释放 EPUB 解析器。

```json
{ "v": 1, "type": "destroy" }
```

## WebView → App 事件

| type | 触发时机 | payload |
|------|---------|---------|
| `bridgeReady` | WebView bridge 初始化完成 | `{ version: 1 }` |
| `epubLoaded` | EPUB 解析完成 | `{ bookId, bookMeta, chapterList }` |
| `bookLoaded` | API 模式 bootstrap 完成 | `{ bookId, bookMeta, chapterList }` |
| `ready` | Reader 初始化完成 | `{ bookId }` |
| `chapterChange` | 换章 | `{ chapterId, width }` |
| `prefetch` | 预取相邻章 | `{ chapterIds, width }` |
| `lineCreate` / `lineUpdate` / `lineDelete` | 划线 CRUD | `LineItem` 或 `{ bookId, webLineId }` |
| `noteCreate` / `noteDelete` | 批注 CRUD | `NoteItem` 或 `{ bookId, webNoteId }` |
| `bookmarkCreate` / `bookmarkDelete` | 书签 CRUD | `BookmarkItem` 或 `{ bookId, chapterId, id }` |
| `readingPositionChange` | 阅读进度（debounce 800ms） | `ReadingSnapshot` |
| `ttsAudioRequest` | 请求 TTS 音频 | `{ reqId, text, voiceType, chapterId }` |
| `ttsReadTimeReport` | TTS 播放时长 | `{ bookId, chapterId, seconds }` |
| `navigate` | 路由跳转（随感等） | `{ path }` |
| `linkClick` | 正文链接 | `{ href }` |
| `loginRequired` | 付费/登录拦截 | `{ reason: 'paid' \| 'trial_end' \| 'auth' }` |
| `error` | 错误 | `{ scope, message }` |

## 乐观 UI Reconcile 流程

1. 用户划线 → WebView 发 `lineCreate`（含 `clientId = webLineId`）
2. App 调 API 保存
3. 成功 → App 发 `updateLines`（对应项带 `clientId`）
4. 失败 → App 发 `signalAnnotationFailure` → WebView rollback

## 数据源模式对比

| 模式 | 入口命令 | 章节来源 | 切章时 |
|------|---------|---------|--------|
| EPUB | `loadEpub` | epub-adapter 内部解析 | WebView 自行取章 |
| API | `loadBook` | App 注入 | 发 `chapterChange`/`prefetch`，App 回注 `injectChapter` |

### API 模式 Bootstrap 时序

```
1. App 并行请求后端：bookMeta / chapterList / lines / notes / bookmarks / readPosition / checkread
2. App 请求首章 HTML：fetchChapterContent(bookId, initialChapterId, 398)
3. App dispatch('loadBook', payload)
4. WebView 发 bookLoaded → 进入阅读态
5. 可选：预取相邻章，提前 injectChapter
```

### API 模式切章时序

```
1. 用户翻页 → WebView 发 chapterChange { chapterId, width }
2. App 若未缓存该章：
   a. dispatch injectChapter({ chapterId, loadState: 'loading' })  // 可选
   b. 请求后端 fetchChapterContent
   c. dispatch injectChapter({ chapterId, content, access, loadState: 'ready' })
```

## 构建与集成

```bash
pnpm --filter @react-epub-reader/webview-bundle build
# 产物：packages/webview-bundle/dist/
```

```
dist/
├── index.html
├── assets/
│   ├── index.js
│   └── index.css
└── docs/
    ├── PROTOCOL.md       # Bridge 协议
    └── examples/         # RN / Flutter 参考代码
        ├── rn-bridge.ts
        └── flutter_bridge.dart
```

将 `dist/` 目录打入 App assets：

- **RN Android**: `file:///android_asset/webview/index.html`
- **RN iOS**: bundle 内 HTML 或本地 file URL
- **Flutter**: `assets/webview/index.html`

## 浏览器调试

打开 dev server 或 dist/index.html，在控制台：

```javascript
window.__EpubReader.dispatch(JSON.stringify({
  v: 1,
  type: 'loadEpub',
  payload: {
    bookId: 1,
    source: { kind: 'url', data: '/sample.epub' }
  }
}))
```

参考示例代码：
- [`examples/rn-bridge.ts`](./examples/rn-bridge.ts) — RN 侧 bridge 工具函数
- [`examples/flutter_bridge.dart`](./examples/flutter_bridge.dart) — Flutter 侧参考 widget

> **AI 接入**：将 `dist/` 拷入 App 工程后，对话中 `@dist/docs/PROTOCOL.md` 或 `@dist/docs` 即可带入协议与示例。
