---
name: bottom-sheet-component
overview: 封装通用 BottomSheet 底部弹窗组件（进入/退出动画 + 手势下滑关闭 + 弹簧物理引擎），并应用到目录、TTS播放器、字体、笔记、倍速、定时、音色等 7 个弹窗。
todos:
  - id: create-bottom-sheet
    content: 新建 BottomSheet 通用组件：实现进场/退场 CSS 动画、手势下滑跟手、松手弹簧物理关闭、遮罩点击关闭
    status: completed
  - id: apply-catalog-popup
    content: 改造 CatalogPopup：用 BottomSheet 包裹目录弹窗内容，移除原有 mask/root 定位样式
    status: completed
    dependencies:
      - create-bottom-sheet
  - id: apply-tts-popup
    content: 改造 TtsPopup：用 BottomSheet 包裹 TTS 播放器内容，移除原有 CSS 动画和定位样式
    status: completed
    dependencies:
      - create-bottom-sheet
  - id: apply-tts-sub-popups
    content: 改造 TtsSpeedPopup/TtsTimeoutPopup/TtsVoicePopup：三个子弹窗统一用 BottomSheet 包裹
    status: completed
    dependencies:
      - create-bottom-sheet
  - id: apply-notes-popup
    content: 改造 NotesPopup：从全屏模态切换为底部弹窗样式，用 BottomSheet 包裹
    status: completed
    dependencies:
      - create-bottom-sheet
  - id: apply-font-weight-popup
    content: 改造 FontPanel 字重子弹窗：用 BottomSheet 包裹 font-weight-popup 内容
    status: completed
    dependencies:
      - create-bottom-sheet
---

## 用户需求

优化阅读器底部弹窗的用户体验，封装通用 BottomSheet 组件并应用到现有弹窗。

## 核心功能

- **通用底部弹窗组件**：封装可复用的 BottomSheet，接收 `visible`、`onClose`、`children` 等 props
- **进入动画**：面板从底部滑入（translateY: 100% → 0），遮罩透明度从 0 → 1
- **退出动画**：面板向下滑出（translateY: 0 → 100%），遮罩透明度从 1 → 0，动画完成后卸载
- **手势下滑关闭**：手指下滑时面板跟手移动，松手时若位移超过阈值（如面板高度 30%）则触发弹簧物理动画自动关闭，否则回弹到原位
- **弹簧物理引擎**：复用现有 `createSpringAnimation()`，实现松手后的自然回弹/关闭动画
- **覆盖范围**：目录弹窗（CatalogPopup）、TTS 播放器弹窗（TtsPopup）、笔记弹窗（NotesPopup）、倍速弹窗（TtsSpeedPopup）、定时播放弹窗（TtsTimeoutPopup）、音色弹窗（TtsVoicePopup）、字体字重子面板（FontPanel 内）

## 技术选型

- **框架**：React + TypeScript
- **状态管理**：zustand（复用现有 `useUiStore`）
- **动画**：复用项目已有弹簧物理引擎 `createSpringAnimation`（`packages/reader/src/core/motion/spring.ts`）+ CSS transition 辅助
- **手势**：原生 touch/mouse 事件，遵循项目现有 pattern（`useTouchFlip`、`useSlideMotionBridge` 的风格）

## 实现方案

### 整体策略

新建 `BottomSheet` 通用组件，内部管理三种状态：`entering`（进场动画）、`active`（静止/跟手拖拽）、`exiting`（退场动画）。面板位移使用 `transform: translateY()` 驱动，由 CSS transition 负责进场/回弹（固定时长），弹簧物理引擎负责松手后的关闭动画。

### BottomSheet 组件设计

三层架构：

1. **遮罩层**（mask）：`position: fixed; inset: 0`，点击关闭，透明度由状态控制
2. **面板容器**（sheet wrapper）：`flex-end` 对齐，`max-width: 480px`，`border-radius: 16px 16px 0 0`
3. **手势层**：监听 `touchstart/touchmove/touchend`，驱动 `translateY` 偏移

### 状态机

```
idle → (visible=true) → entering → active
active → (touch drag) → dragging → (release above threshold) → exiting → idle
                               → (release below threshold) → bouncing → active
active → (onClose called) → exiting → idle
```

### 手势逻辑

- `touchstart`：记录起始 Y 坐标和当前面板位移
- `touchmove`：实时计算 deltaY，更新面板 translateY（跟手效果），同时更新遮罩透明度（随位移线性降低）
- `touchend`：判断位移是否超过阈值（面板可见高度 × 30%）
- 超过阈值 → 调用 `createSpringAnimation` 从当前位移 + 当前速度动画到面板完全关闭位置 → 触发 `onClose`
- 未超过阈值 → CSS transition 回弹到原位（`translateY: 0`）

### 进场/退场动画

- **进场**：组件 mount 时先设置 `translateY: 100%`，下一帧通过 CSS transition 过渡到 `translateY: 0`，同时遮罩 opacity 从 0 → 1，时长 0.28s ease（与项目规范一致）
- **退场**：设置 `translateY: 100%` + 遮罩 opacity → 0，transition 完成后调用 `onAfterClose` 或直接卸载，时长 0.28s ease

### 弹簧物理引擎复用

复用 `createSpringAnimation`：

- 松手关闭时：`from = 当前translateY位移`，`to = 面板完全展开高度（即面板的offsetHeight）`，`velocity = 当前手指离开速度（px/ms）`
- `onUpdate`：更新面板 translateY
- `onComplete`：调用 `onClose()` 通知父组件关闭

### 性能考虑

- 手势期间直接操作 DOM style（`ref.current.style.transform`），避免 React setState 带来的重渲染开销
- 弹簧动画每一帧通过 rAF 驱动，同样直接操作 DOM
- 遮罩透明度在手势期间线性插值计算后直接写 DOM

## 目录结构

```
packages/reader/src/components/
└── BottomSheet/
    ├── BottomSheet.tsx       # [NEW] 通用底部弹窗组件
    └── bottom-sheet.css      # [NEW] 样式文件
packages/reader/src/components/popups/
├── CatalogPopup/
│   ├── CatalogPopup.tsx      # [MODIFY] 用 BottomSheet 包裹内容
│   └── catalog-popup.css     # [MODIFY] 移除布局/定位样式（由 BottomSheet 接管）
├── tts/
│   ├── TtsPopup.tsx          # [MODIFY] 用 BottomSheet 包裹内容
│   ├── TtsSpeedPopup.tsx     # [MODIFY] 用 BottomSheet 包裹内容
│   ├── TtsTimeoutPopup.tsx   # [MODIFY] 用 BottomSheet 包裹内容
│   ├── TtsVoicePopup.tsx     # [MODIFY] 用 BottomSheet 包裹内容
│   ├── tts-popup.css         # [MODIFY] 移除 .tts-popup-mask/.tts-popup-root 布局/动画样式
│   └── tts-sub-popup.css     # [MODIFY] 移除 .tts-sub-popup-overlay/.tts-sub-popup-sheet 动画样式
├── NotesPopup/
│   └── NotePopup.tsx        # [MODIFY] 用 BottomSheet 包裹内容（需调整为底部弹窗样式）
└── AnnotationListPopup/
    └── ...                   # 无需修改（全屏弹窗，不是底部弹窗）
packages/reader/src/components/settings/
├── FontPanel.tsx             # [MODIFY] 字重子弹窗用 BottomSheet
└── settings.css              # [MODIFY] 移除 .font-weight-popup-mask 定位样式
```

## 关键代码结构

### BottomSheet Props 接口

```ts
export interface BottomSheetProps {
  /** 控制显示/隐藏 */
  visible: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 面板内容 */
  children: React.ReactNode
  /** 面板高度，默认 '78vh' */
  height?: string
  /** 遮罩 z-index，默认 10001 */
  zIndex?: number
  /** 手势关闭阈值比例，默认 0.3 */
  threshold?: number
  /** 是否启用手势下滑关闭，默认 true */
  swipeToClose?: boolean
  /** CSS 类名 */
  className?: string
  /** 面板样式 */
  style?: React.CSSProperties
}
```

### 内部状态

```ts
// 阶段：'idle' | 'entering' | 'active' | 'exiting'
// translateY: 当前面板 Y 轴偏移（px），0 = 原位，正值 = 向下偏移
// maskOpacity: 遮罩透明度 0-1
```

### 弹簧调用示例（松手关闭时）

```ts
createSpringAnimation({
  from: currentTranslateY,
  to: sheetHeight,
  velocity: releaseVelocity, // px/ms，从 touchmove 采样计算
  config: { stiffness: 400, damping: 36, mass: 1 }, // PAGE_FLIP_SPRING
  onUpdate: (y) => { sheetRef.current.style.transform = `translateY(${y}px)` },
  onComplete: () => onClose()
})
```