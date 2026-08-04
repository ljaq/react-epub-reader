# WebView 接入文档

本目录随 `pnpm build` 复制到 `dist/docs/`，与静态 bundle 一并分发。

| 文件 | 说明 |
|------|------|
| [PROTOCOL.md](./PROTOCOL.md) | Bridge 协议（v1）：命令、事件、EPUB / API 双模式时序 |
| [examples/rn-bridge.ts](./examples/rn-bridge.ts) | React Native：`loadBook` / `injectChapter` / `handleApiChapterRequest` |
| [examples/flutter_bridge.dart](./examples/flutter_bridge.dart) | Flutter：`ReaderDataSource.epub` / `.api` 双模式 |

**AI 接入**：将 `dist/` 拷入 App 工程后，在对话中 `@dist/docs` 或 `@dist/docs/PROTOCOL.md` 即可。
