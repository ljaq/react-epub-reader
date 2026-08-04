// Flutter WebView 集成参考
//
// 依赖：webview_flutter 或 flutter_inappwebview
//
// 用法：
// 1. 将 packages/webview-bundle/dist/ 复制到 assets/webview/
// 2. pubspec.yaml 添加 assets/webview/
// 3. 使用 ReaderWebView widget（支持 EPUB / API 双模式）

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// 数据源模式
enum ReaderDataSource { epub, api }

/// 协议消息（与 packages/webview-bundle/src/bridge/protocol.ts 对齐）
class BridgeMessage {
  final int v;
  final String? id;
  final String type;
  final dynamic payload;

  BridgeMessage({required this.v, this.id, required this.type, this.payload});

  factory BridgeMessage.fromJson(Map<String, dynamic> json) {
    return BridgeMessage(
      v: json['v'] as int,
      id: json['id'] as String?,
      type: json['type'] as String,
      payload: json['payload'],
    );
  }

  Map<String, dynamic> toJson() => {
        'v': v,
        if (id != null) 'id': id,
        'type': type,
        if (payload != null) 'payload': payload,
      };
}

String createMessage(String type, [dynamic payload, String? id]) {
  return jsonEncode(BridgeMessage(v: 1, id: id, type: type, payload: payload).toJson());
}

String escapeForJs(String json) => json.replaceAll('\\', r'\\').replaceAll("'", r"\'");

/// Bridge 命令封装（对齐 RN createRnBridge）
class ReaderBridge {
  ReaderBridge(this._dispatch);

  final void Function(String type, [dynamic payload]) _dispatch;

  void loadEpub(String epubUrl, int bookId, [Map<String, dynamic>? options]) {
    _dispatch('loadEpub', {
      'bookId': bookId,
      'source': {'kind': 'url', 'data': epubUrl},
      ...?options,
    });
  }

  void loadBook(Map<String, dynamic> payload) => _dispatch('loadBook', payload);

  void injectChapter(Map<String, dynamic> payload) => _dispatch('injectChapter', payload);

  void updateChapterAccess(Map<String, dynamic> chapterAccess, {bool merge = true}) {
    _dispatch('updateChapterAccess', {'chapterAccess': chapterAccess, 'merge': merge});
  }

  void updateLines(int chapterId, List<Map<String, dynamic>> lines, {bool merge = true}) {
    _dispatch('updateLines', {'chapterId': chapterId, 'lines': lines, 'merge': merge});
  }

  void updateNotes(int chapterId, List<Map<String, dynamic>> notes, {bool merge = true}) {
    _dispatch('updateNotes', {'chapterId': chapterId, 'notes': notes, 'merge': merge});
  }

  void updateBookmarks(int chapterId, List<Map<String, dynamic>> bookmarks, {bool merge = true}) {
    _dispatch('updateBookmarks', {'chapterId': chapterId, 'bookmarks': bookmarks, 'merge': merge});
  }

  void updateUser(Map<String, dynamic> user) => _dispatch('updateUser', user);

  void signalAnnotationFailure(String clientId, String type, int chapterId) {
    _dispatch('signalAnnotationFailure', {
      'clientId': clientId,
      'type': type,
      'chapterId': chapterId,
    });
  }

  void injectTtsAudio(Map<String, dynamic> entry) => _dispatch('injectTtsAudio', entry);

  void destroy() => _dispatch('destroy');
}

/// API 模式：请求后端后 injectChapter
Future<void> handleApiChapterRequest(
  ReaderBridge bridge,
  int bookId,
  Future<Map<String, dynamic>> Function(int bookId, int chapterId, int width) fetchChapter,
  int chapterId,
  int width,
) async {
  bridge.injectChapter({'chapterId': chapterId, 'loadState': 'loading'});
  try {
    final result = await fetchChapter(bookId, chapterId, width);
    final content = result['content'] as Map<String, dynamic>?;
    bridge.injectChapter({
      'chapterId': chapterId,
      'content': content,
      'access': result['access'],
      'loadState': content?['html'] != null ? 'ready' : 'error',
    });
  } catch (_) {
    bridge.injectChapter({'chapterId': chapterId, 'loadState': 'error'});
  }
}

class ReaderWebView extends StatefulWidget {
  final ReaderDataSource dataSource;
  final int bookId;
  /// EPUB 模式必填
  final String? epubUrl;
  /// API 模式：WebView 加载完成后由 App 拉取 bootstrap 并 loadBook
  final Future<void> Function(ReaderBridge bridge)? onApiBootstrap;
  final void Function(BridgeMessage msg, ReaderBridge bridge)? onBridgeMessage;

  const ReaderWebView({
    super.key,
    required this.dataSource,
    this.bookId = 1,
    this.epubUrl,
    this.onApiBootstrap,
    this.onBridgeMessage,
  }) : assert(
          dataSource == ReaderDataSource.epub ? epubUrl != null : onApiBootstrap != null,
          'epub 模式需 epubUrl；api 模式需 onApiBootstrap',
        );

  @override
  State<ReaderWebView> createState() => _ReaderWebViewState();
}

class _ReaderWebViewState extends State<ReaderWebView> {
  late final WebViewController _controller;
  late final ReaderBridge _bridge;

  @override
  void initState() {
    super.initState();
    _bridge = ReaderBridge(_dispatch);
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'EpubReaderBridge',
        onMessageReceived: (JavaScriptMessage msg) {
          try {
            final data = jsonDecode(msg.message) as Map<String, dynamic>;
            final bridgeMsg = BridgeMessage.fromJson(data);
            widget.onBridgeMessage?.call(bridgeMsg, _bridge);
            _handleBridgeMessage(bridgeMsg);
          } catch (_) {
            // ignore parse errors
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) => _onPageReady(),
        ),
      )
      ..loadFlutterAsset('assets/webview/index.html');
  }

  void _dispatch(String type, [dynamic payload]) {
    final raw = createMessage(type, payload);
    _controller.runJavaScript(
      "window.__EpubReader.dispatch('${escapeForJs(raw)}')",
    );
  }

  Future<void> _onPageReady() async {
    if (widget.dataSource == ReaderDataSource.epub) {
      _bridge.loadEpub(widget.epubUrl!, widget.bookId);
      return;
    }
    await widget.onApiBootstrap?.call(_bridge);
  }

  Future<void> _handleBridgeMessage(BridgeMessage msg) async {
    if (widget.dataSource != ReaderDataSource.api) return;

    switch (msg.type) {
      case 'chapterChange':
        // App 应实现 fetchChapter 并调用 handleApiChapterRequest
        // final payload = msg.payload as Map<String, dynamic>;
        // await handleApiChapterRequest(_bridge, widget.bookId, fetchChapter, payload['chapterId'], payload['width']);
        break;
      case 'prefetch':
        // final payload = msg.payload as Map<String, dynamic>;
        // for (final id in payload['chapterIds'] as List) {
        //   await handleApiChapterRequest(_bridge, widget.bookId, fetchChapter, id, payload['width']);
        // }
        break;
      default:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}

// ── 使用示例 ──
//
// EPUB 模式：
// ReaderWebView(
//   dataSource: ReaderDataSource.epub,
//   epubUrl: 'file:///path/to/book.epub',
//   bookId: 1,
// )
//
// API 模式：
// ReaderWebView(
//   dataSource: ReaderDataSource.api,
//   bookId: 12535542,
//   onApiBootstrap: (bridge) async {
//     final meta = await api.fetchBookMeta(bookId);
//     final chapterList = await api.fetchChapterList(bookId);
//     final content = await api.fetchChapterContent(bookId, initialChapterId, 398);
//     bridge.loadBook({
//       'bookId': bookId,
//       'bookMeta': meta,
//       'chapterList': chapterList,
//       'chapterAccess': {initialChapterId: content.access},
//       'chapters': {initialChapterId: content.content},
//       'chapterLoadStates': {initialChapterId: 'ready'},
//       'initialChapterId': initialChapterId,
//     });
//   },
//   onBridgeMessage: (msg, bridge) async {
//     if (msg.type == 'chapterChange') {
//       final p = msg.payload as Map<String, dynamic>;
//       await handleApiChapterRequest(bridge, bookId, api.fetchChapterContent, p['chapterId'], p['width']);
//     }
//   },
// )
