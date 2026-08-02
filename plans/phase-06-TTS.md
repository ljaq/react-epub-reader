# Phase 6 — TTS 模块（子 Agent F）

> 执行者：子 Agent F。前置：Phase 1 done（core/tts）+ Phase 2 done（content）+ Phase 3 done（chrome/popups）。产出 TTS 引擎接入 + 全套播放器 UI + 音频回调。

## 必读

1. 本 plan
2. plans/00-总览与契约.md（§4 TtsVoiceType/TtsAudioEntry、§6 onTtsAudioRequest/onTtsReadTimeReport、TTS 音频流说明）
3. old-vue-reader/components/{TtsPopup,TtsMiniPlayer,TtsReturnBar,TtsSpeedPopup,TtsTimeoutPopup,TtsVoicePopup,TtsPlayPositionDialog}/
4. old-vue-reader/utils/tts/*（Phase 1 已移植 core/tts）
5. old-vue-reader/prd/cursor-plan/06-语音朗读.md
6. old-vue-reader/prd/design/ 打开语音朗读.png、H5Player 弹窗样式

## 任务清单

### 1. core/tts/TtsEngine 接入
- useRef 持有实例？不——TtsEngine 是纯类（Phase 1），播放态进 tts-store
- store/tts-store.ts：engineRef + playing/paused/speed/timeout/voice + reqId → url 队列

### 2. 音频流（fire-and-forget + prop 注入）
- 引擎需音频 → onTtsAudioRequest({ reqId, text, voiceType, chapterId })
- 宿主拿到 URL → 通过 ttsAudioUrl prop（按 reqId）注入
- reader 内部 reqId → url 队列，URL 到位即播
- 预取下一段音频（宿主侧）

### 3. popups/tts/
- TtsPopup：主面板
- MiniPlayer：左下角 16px
- ReturnBar：返回栏
- SpeedPopup：倍速 0.5–2.1
- TimeoutPopup：定时
- VoicePopup：音色（消费 ttsVoiceTypes prop）

### 4. 高亮跟随
- core/tts 的 isTtsPlaybackInView / tts-scroll 接入

### 5. 段间续播 + 离开阅读位置确认
- confirmTtsPlayPosition（core/tts）
- TtsPlayPositionDialog

### 6. 切换翻页模式中断播放
- settings.horizontalEnabled 变化 → 中断 TTS（与 Phase 3 留的 hook 对接）

### 7. 播放时长上报
- onTtsReadTimeReport({ bookId, chapterId, seconds })

## Vue 对照自查表

- [ ] MiniPlayer 左下角 16px
- [ ] 倍速 0.5–2.1
- [ ] 定时选项与 Vue 一致
- [ ] 音色列表来自 ttsVoiceTypes prop（reader 不内置）
- [ ] 段间自动续播
- [ ] 高亮跟随
- [ ] 离开阅读位置确认弹窗
- [ ] 切换翻页模式中断播放
- [ ] onTtsAudioRequest fire-and-forget，不返回 Promise
- [ ] ttsAudioUrl prop 注入后播放
- [ ] 视觉对照 打开语音朗读.png / H5Player 弹窗

## 交付物

- packages/reader/src/components/popups/tts/*
- packages/reader/src/store/tts-store.ts
- 自查报告

## 验收（总架构师）

- 播放/暂停/倍速/定时/音色切换
- 段间续播 + 高亮跟随
- 离开阅读位置确认弹窗
- 切换翻页模式中断播放
- onTtsAudioRequest 不返回 Promise（grep 验证无 await 回调返回值）
- ttsAudioUrl prop 注入触发播放

## 源码对应关系（只读对照，源码是真理）

### TTS 组件（**7 个，全文复刻**）
- TtsPopup → components/TtsPopup/index.vue（800 行，主面板）
- TtsMiniPlayer → components/TtsMiniPlayer/index.vue（310 行，左下角 16px）
- TtsReturnBar → components/TtsReturnBar/index.vue（188 行）
- TtsSpeedPopup → components/TtsSpeedPopup/index.vue（347 行，倍速 0.5–2.1）
- TtsTimeoutPopup → components/TtsTimeoutPopup/index.vue（193 行，定时）
- TtsVoicePopup → components/TtsVoicePopup/index.vue（154 行，音色）
- TtsPlayPositionDialog → components/TtsPlayPositionDialog/index.vue（177 行，离开阅读位置确认）

### TTS 引擎与状态（Phase 1 已移植 core/tts，此处接入）
- utils/tts/tts-engine.js（TtsEngine 类）
- store/tts-state.js（277 行）：`createTtsState`（14）、`syncTtsStateFromEngine`（42）、`createTtsMutations`（108）、`attachTtsState`（273）、`MOCK_VOICES`（5，**reader 不内置音色，仅参考结构，音色来自 ttsVoiceTypes prop**）
- utils/tts-scroll.js（397 行）：`isTtsPlaybackInView`、高亮跟随
- utils/tts/tts-storage.js：`getTtsTimbreConfig`
- utils/tts/tts-confirm.js：`confirmTtsPlayPosition`

### TTS 数据流 → store/reader-context.js
- `isTtsActivelyPlaying`（393）、`resolveTtsPlaybackStartMode`（397）、`syncTtsSessionAfterStart`（419）
- `openTtsPopup`（1417）、`startTtsPlayback`（1456）、`startTtsFromCurrentRead`（1494）
- `goTtsChapter`（625）

### API（宿主侧，Phase 8 迁移，此处对照契约）
- api/tts.js：fetchTtsAudio/fetchTtsAudioRaw（POST /audio/tts）
- api/tts-report.js：reportTtsReadTime
- 真实 payload 见 接口案例.md（搜 audio/tts）

### 设计图
- old-vue-reader/prd/design/打开语音朗读.png、H5Player 弹窗样式

### 注意（契约关键）
- Vue 的 fetchTtsAudio 是 async POST；React 改为 onTtsAudioRequest fire-and-forget + ttsAudioUrl prop 注入（见 00-总览与契约 §6 TTS 音频流）
- 切换翻页模式中断 TTS：与 Phase 3 SettingsPanel 留的 hook 对接
