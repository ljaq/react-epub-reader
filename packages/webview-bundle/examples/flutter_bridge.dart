// Flutter WebView 集成参考
//
// 依赖：webview_flutter 或 flutter_inappwebview
//
// 用法：
// 1. 将 packages/webview-bundle/dist/ 复制到 assets/webview/
// 2. pubspec.yaml 添加 assets/webview/
// 3. 使用 EpubReaderWebView widget

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

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

/// 转义 JS 字符串中的单引号
String escapeForJs(String json) => json.replaceAll('\\', r'\\').replaceAll("'", r"\'");

class EpubReaderWebView extends StatefulWidget {
  final String epubUrl;
  final int bookId;
  final void Function(BridgeMessage msg)? onBridgeMessage;

  const EpubReaderWebView({
    super.key,
    required this.epubUrl,
    this.bookId = 1,
    this.onBridgeMessage,
  });

  @override
  State<EpubReaderWebView> createState() => _EpubReaderWebViewState();
}

class _EpubReaderWebViewState extends State<EpubReaderWebView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'EpubReaderBridge',
        onMessageReceived: (JavaScriptMessage msg) {
          try {
            final data = jsonDecode(msg.message) as Map<String, dynamic>;
            final bridgeMsg = BridgeMessage.fromJson(data);
            widget.onBridgeMessage?.call(bridgeMsg);
            _handleBridgeMessage(bridgeMsg);
          } catch (_) {
            // ignore parse errors
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) => _loadEpub(),
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

  void _loadEpub() {
    _dispatch('loadEpub', {
      'bookId': widget.bookId,
      'source': {'kind': 'url', 'data': widget.epubUrl},
    });
  }

  void _handleBridgeMessage(BridgeMessage msg) {
    switch (msg.type) {
      case 'chapterChange':
        // API 模式：请求后端后 injectChapter
        // final payload = msg.payload as Map<String, dynamic>;
        // final chapterId = payload['chapterId'] as int;
        // final width = payload['width'] as int;
        // _dispatch('injectChapter', {'chapterId': chapterId, 'loadState': 'loading'});
        // final result = await fetchChapterContent(bookId, chapterId, width);
        // _dispatch('injectChapter', {'chapterId': chapterId, 'content': result.content, 'access': result.access, 'loadState': 'ready'});
        break;
      case 'lineCreate':
        // TODO: 调 API 保存划线
        // 成功: _dispatch('updateLines', {'chapterId': ..., 'lines': [...], 'merge': true})
        // 失败: _dispatch('signalAnnotationFailure', {'clientId': ..., 'type': 'line', 'chapterId': ...})
        break;
      case 'ttsAudioRequest':
        // TODO: fetch audio URL
        // _dispatch('injectTtsAudio', {'reqId': ..., 'url': ..., 'text': ..., 'voiceType': ...})
        break;
      case 'navigate':
        // TODO: App 侧打开随感页
        break;
      default:
        break;
    }
  }

  /// 外部可调用的 bridge 方法
  void loadBook(Map<String, dynamic> payload) {
    _dispatch('loadBook', payload);
  }

  void injectChapter(Map<String, dynamic> payload) {
    _dispatch('injectChapter', payload);
  }

  void updateChapterAccess(Map<String, dynamic> chapterAccess, {bool merge = true}) {
    _dispatch('updateChapterAccess', {'chapterAccess': chapterAccess, 'merge': merge});
  }

  void updateLines(int chapterId, List<Map<String, dynamic>> lines, {bool merge = true}) {
    _dispatch('updateLines', {'chapterId': chapterId, 'lines': lines, 'merge': merge});
  }

  void signalAnnotationFailure(String clientId, String type, int chapterId) {
    _dispatch('signalAnnotationFailure', {
      'clientId': clientId,
      'type': type,
      'chapterId': chapterId,
    });
  }

  void injectTtsAudio(Map<String, dynamic> entry) {
    _dispatch('injectTtsAudio', entry);
  }

  void destroy() {
    _dispatch('destroy');
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}

// ── flutter_inappwebview 变体 ──
//
// InAppWebView(
//   initialFile: 'assets/webview/index.html',
//   onWebViewCreated: (controller) {
//     controller.addJavaScriptHandler(
//       handlerName: 'EpubReaderBridge',
//       callback: (args) {
//         final msg = BridgeMessage.fromJson(jsonDecode(args[0]));
//         // handle message
//       },
//     );
//   },
//   onLoadStop: (controller, url) {
//     controller.evaluateJavascript(source:
//       "window.__EpubReader.dispatch('${escapeForJs(createMessage('loadEpub', {...}))}')"
//     );
//   },
// )
