# Phase 1 — 引擎纯函数移植（子 Agent A）

> 执行者：子 Agent A。前置：Phase 0 done。产出 core/ 纯函数 + 单测，零 React 依赖。

## 目标

将 old-vue-reader/utils/ 与 store/chapter-buffer.js 中零 UI 逻辑移植为 TypeScript 纯模块，附 vitest 单测。DOM 类型通过参数/接口注入，可在 jsdom 下单测。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§4 数据契约、§7 reconcile、§10 约束）
3. old-vue-reader/utils/ 对应源文件（只读对照）
4. old-vue-reader/store/chapter-buffer.js

## 任务清单

| 源文件 | 目标 | 要点 |
|---|---|---|
| utils/pagination.js | core/pagination/ | PAGE_COLUMN_GAP=40、getPageStride、clampPageIndex、trimEmptyTrailingPages、getSegmentWidthPx |
| store/chapter-buffer.js | core/chapter-buffer/ | CHAPTER_BUFFER_RADIUS=1（以源码为准，非 TECH-SPEC 的 2）、computeBufferRange、createEmptyBuffer、findChapterIndex、getAdjacentChapterId、filterBlockedChapterOrder、getMissingBufferIds、globalToLocal、localToGlobal、mergeBufferContents、rebuildSegmentOffsets、updateSegmentPageCounts、isSegmentReady、shouldSkipPaidPrefetch、computeRemovedPagesFromFront |
| utils/selection-engine.js + selection-text-pos.js + selection-dom-path.js + selection-range.js | core/selection/ | SELECTION_MODE_HORIZONTAL/VERTICAL、createSelectionEngine、encodeDomPath、findBodyFromPoint、findParagraphFromPoint、getDomsInView、buildInitialBoundaries、clientToBoundaryPoint、getTextsPos、highlightPosListToPosInfo、highlightPosListToText、normalizeBoundaries、adjustHighlightDist、toScreenRects、isChineseDominant |
| utils/line-highlight.js | core/highlights/line.ts | DEFAULT_UNDERLINE_COLOR、LINE_COLOR_BLUE、isBackgroundLineColor、applyLineMarkStyle、wrapLineMark、unwrapLineMark、syncChapterLines |
| utils/note-highlight.js | core/highlights/note.ts | wrapNoteMark、unwrapNoteMark、syncChapterNotes、角标定位 |
| utils/reading-position.js + pos-info.js | core/reading-position/ | generateReaderWebId、generateBookmarkId、parseStrIdxFromBookmarkId、encodeBookmarkSummary、decodeBookmarkSummary、extractDomPosBase、getParagraphIndexFromDomPos、resolveGoChapterInitialPageIndex、resolveHorizontalPageFromDomPos、resolveHorizontalPageFromStrIdx、resolveDomPosFromStrIdx |
| utils/chapter-nav-html.js | core/chapter-nav.ts | wrapChapterHtmlWithNav（章首 pill「上一章」左对齐 + 章末通栏「下一章」） |
| utils/bookmark-match.js | core/bookmark-match.ts | 匹配当前位置书签 |
| utils/reader-viewport.js | core/reader-viewport.ts | getReaderContentWidth（width=398 来源） |
| utils/book-css.js + book-css-clear.js + book-css-rules.js + book-css-rules.generated.json | core/book-css/ | 注入规则、清理、白名单 |
| utils/tts/tts-engine.js + tts-segments.js + tts-state.js + tts-storage.js + tts-confirm.js + tts-scroll.js | core/tts/ | TtsEngine 类（纯逻辑）、extractTtsSegments、切段、续播排队、isTtsPlaybackInView、confirmTtsPlayPosition、getTtsTimbreConfig |
| utils/format-time.js | core/format-time.ts | 时间格式化（笔记/TTS 用） |
| utils/chapter-access.js | core/chapter-access.ts | parseNextChapterAccess、parseCheckReadAccess（10003/10004） |
| utils/reader-auth.js | core/reader-auth.ts | READER_LOGIN_MESSAGES、loginAlert 文案常量 |

## 实现要求

- 零 React 依赖（不得 import react/react-dom）
- DOM 操作通过参数传入（rootEl、doc 等），不直接 import jsdom
- 常量值与 Vue 源码逐字对照，不得改写
- posInfo / domPos 编解码字节级兼容 Vue（用同一份测试夹具验证）
- 每个 core 模块附 vitest 单测，覆盖：分页计算、buffer range、posInfo 编解码、选中双模式、wrap/unwrap、TTS 切段

## Vue 对照自查表（交付前逐项勾选并附证据）

- [ ] PAGE_COLUMN_GAP=40（utils/pagination.js:1）
- [ ] pageStride = pageWidth + gap（getPageStride）
- [ ] trimEmptyTrailingPages 去章末 phantom 空白页
- [ ] getSegmentWidthPx = pageCount×stride − gap；不强制 columns body 宽度
- [ ] CHAPTER_BUFFER_RADIUS=1（store/chapter-buffer.js:3，以源码为准）
- [ ] wrapChapterHtmlWithNav：章首 pill「上一章」左对齐 + 章末通栏「下一章」
- [ ] 划线色值规则：underlineColor.length > 7 黄底，≤7 蓝线（line-highlight.js:10-11）
- [ ] DEFAULT_UNDERLINE_COLOR='rgba(255,157,0,0.3)'、LINE_COLOR_BLUE='#0080FF'
- [ ] posInfo 编解码与 utils/pos-info.js 字节级兼容（单测用接口案例.md 真实 posInfo 断言）
- [ ] domPos 格式 "0=1=7=0#N" 不变
- [ ] TTS 切段逻辑与 utils/tts-segments.js 一致
- [ ] 选中双模式 SELECTION_MODE_HORIZONTAL / SELECTION_MODE_VERTICAL
- [ ] chapter-access：10003 needLogin、10004 needPurchase
- [ ] core/ 无任何 import 'react' 或 import 'react-dom'

## 交付物

- packages/reader/src/core/ 全部模块
- packages/reader/src/core/__tests__/ 单测
- 自查报告（见 plans/README.md 格式）

## 验收（总架构师）

- 契约一致性：types 引用正确
- 单测通过率 + 关键路径覆盖（posInfo/分页/选中）
- core/ 零 React 依赖（grep 验证）
- 常量逐项抽查 3 项对照 Vue 源码

## 源码对应关系（只读对照，源码是真理，Vue plan 文档可能偏旧）

> 行号以当前 old-vue-reader/ 为准；移植时以源码实际内容为准，本表仅作导航。

### pagination → utils/pagination.js（283 行）
- `PAGE_COLUMN_GAP=40`、`getPageStride`、`clampPageIndex`：第 1–25 行
- `trimEmptyTrailingPages`、`getSegmentWidthPx`、TreeWalker 分页测量：全文通读
- 注意 `REMAINDER_TRIM_THRESHOLD=4`（第 2 行）

### chapter-buffer → store/chapter-buffer.js（280 行）
- `CHAPTER_BUFFER_RADIUS=1`（第 3 行，**以源码 1 为准，非 TECH-SPEC 的 2**）
- `getSegmentWidthPx`、`createEmptyBuffer`、`findChapterIndex`、`computeBufferRange`：第 1–38 行
- `fetchBufferChapters`、`fetchBufferChaptersPrioritized`、`getAdjacentChapterId`、`filterBlockedChapterIds`、`getMissingBufferIds`、`globalToLocal`、`localToGlobal`、`isSegmentReady`、`shouldSkipPaidPrefetch`、`mergeBufferContents`、`rebuildSegmentOffsets`、`updateSegmentPageCounts`、`computeRemovedPagesFromFront`：全文通读

### selection → utils/selection-engine.js（265）+ selection-text-pos.js（526）+ selection-dom-path.js（174）+ selection-range.js（20）
- `SELECTION_MODE_VERTICAL`/`HORIZONTAL`：selection-dom-path.js 第 6–7 行
- `createSelectionEngine`：selection-engine.js 第 38 行（`createEmptyState` 第 22 行）
- `encodeDomPath`、`findBodyFromPoint`、`findParagraphFromPoint`、`getDomsInView`：selection-dom-path.js
- `buildInitialBoundaries`、`clientToBoundaryPoint`、`getTextsPos`、`highlightPosListToPosInfo`、`highlightPosListToText`、`normalizeBoundaries`、`adjustHighlightDist`、`toScreenRects`、`isChineseDominant`、`getSelectionBoundingRect`、`getBoundaryHandleRects`：selection-text-pos.js 全文

### highlights/line → utils/line-highlight.js（684 行）
- `DEFAULT_UNDERLINE_COLOR`/`LINE_COLOR_BLUE`/`LINE_COLOR_MAP`/`isBackgroundLineColor`/`applyLineMarkStyle`：第 4–32 行
- `wrapLineMark`（第 569 行）、`unwrapLineMark`（625）、`updateLineMarkStyle`（635）、`applyChapterLines`（598）、`findLineTarget`（533）、`buildTargetRangeFromPosInfo`（419）、`getPosInfoBoundaryKeys`（436）、`detectDuplicateLine`（486）、`detectSelectionInsideLineMark`（461）
- 内部：`createMarkElement`、`wrapTextNodeSlice`、`wrapRangeByTextNodes`、`buildRangeFromPosInfoEntries`、`parsePosInfoEntries`、`groupEntriesByBlock`、`resolveNodeFromPath`

### highlights/note → utils/note-highlight.js（266 行）
- `groupChapterNotes`（第 7 行）、`wrapNoteMark`（143）、`syncChapterNotes`（174）、`applyChapterNotes`（199）、`syncNoteBadges`（203，角标定位）、`getNotesByGroupId`（258）
- `BADGE_TOP_OFFSET=20`（第 44 行，角标偏移常量）

### reading-position → utils/reading-position.js（1157 行）+ pos-info.js（291 行）
- pos-info.js：`generateReaderWebId`（3）、`generateBookmarkId`（7）、`parseStrIdxFromBookmarkId`（15）、`encodeBookmarkSummary`（34）、`decodeBookmarkSummary`（68）、`buildPosInfoFromText`（93）、`encodeSummary`（106）、`decodeSummary`（122）、`extractDomPosFromPosInfo`（150）、`extractDomPosBase`（177）、`getParagraphIndexFromDomPos`（182）、`buildDomPosBaseFromRange`（203）、`buildPosInfoFromHighlightPosList`（213）、`buildPosInfoFromRange`（241）
- reading-position.js：`resolveGoChapterInitialPageIndex`、`resolveHorizontalPageFromDomPos`、`resolveHorizontalPageFromStrIdx`、`resolveDomPosFromStrIdx`、`buildReadPositionPayload`（318）、`applyDomPosScroll`（264）、`applyPrecentScroll`（255）、`scrollRangeIntoView`（226）、`resolveHorizontalPageIndexFromContentLeft`（416）

### chapter-nav → utils/chapter-nav-html.js（38 行，全文通读）
- `wrapChapterHtmlWithNav`、`getChapterNavFlags`：章首 pill「上一章」左对齐 + 章末通栏「下一章」

### bookmark-match → utils/bookmark-match.js（78 行，全文通读）
- 匹配当前位置书签逻辑

### reader-viewport → utils/reader-viewport.js（76 行，全文通读）
- `getReaderContentWidth`（width=398 来源）

### book-css → utils/book-css.js（85）+ book-css-clear.js（178）+ book-css-rules.js（40）+ book-css-rules.generated.json
- 注入规则、清理、白名单；全文通读

### tts → utils/tts/tts-engine.js + tts-segments.js（1 行，实为 re-export）+ store/tts-state.js（277）+ utils/tts-scroll.js（397）+ utils/tts/tts-storage.js + tts-confirm.js
- `TtsEngine` 类、`extractTtsSegments`、`createTtsState`（tts-state.js:14）、`syncTtsStateFromEngine`（:42）、`createTtsMutations`（:108）、`attachTtsState`（:273）、`MOCK_VOICES`（:5，**reader 不内置，仅参考结构**）、`isTtsPlaybackInView`、`confirmTtsPlayPosition`、`getTtsTimbreConfig`

### 其他
- format-time → utils/format-time.js（11 行，全文）
- chapter-access → utils/chapter-access.js（37 行，全文）：`parseNextChapterAccess`、`parseCheckReadAccess`，10003/10004
- reader-auth → utils/reader-auth.js（100 行）：`READER_LOGIN_MESSAGES`、`loginAlert` 文案常量
- reader-content-styles → utils/reader-content-styles.js（43 行，Phase 2 也会用）
- reader-content-interactions → utils/reader-content-interactions.js（39 行，Phase 9 用）
- reader-chapter-jump → utils/reader-chapter-jump.js（28 行）
- reader-bookshelf → utils/reader-bookshelf.js（9 行）
- reading-position-report → utils/reading-position-report.js（106 行，Phase 5 用）

### 单测夹具
- posInfo 真实数据：old-vue-reader/prd/接口案例.md 第 37 行（发起划线 summary 中的 posInfo）与第 60–117 行（划线列表 posInfo）
- 用真实 posInfo 断言编解码字节级兼容
