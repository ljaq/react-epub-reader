# Phase 14：仿真翻页（掌阅级，基于 page-flip 机制自研）

## 0. 背景与目标

- phase-10 真分页（主从页式结构）+ `PageSurface` 页抽象已落地，明确为仿真翻页铺路；
  phase-11 物理弹簧手感（fling/速度连续/可打断）；phase-13 覆盖模式视差+遮罩。
- 现状：`flipMode: 'simulation'` 已在设置面板占位（置灰"敬请期待"），渲染回退 cover。
- 本期目标：接通仿真翻页——折角跟手（二维）、阴影弯曲感、物理弹簧收尾，
  与覆盖/平移同源的提交判定与页码机制，达到掌阅同级观感。
- 参考书：`page-flip@2.0.7`（已安装，TS 源码随包分发）。

## 1. page-flip 源码调研结论（机制拆解）

page-flip 本质是**纯 CSS 2D 几何方案**（不是 WebGL/Canvas），由四层组成：

### 1.1 几何核 `FlipCalculation`（~430 行纯数学，零 DOM）

```
手指点 localPos
  → 折痕 = 手指点与书脊折角原点连线的垂直平分线
  → 旋转角 angle = 2·acos((pageRect.width - pos.x) / d)
      （折角场景 d 限制 ≤ √2·width，对应 angle ∈ [0, π/2]）
  → 页四角旋转后的 rect → 与书边界求交（top/side/bottom intersect）
  → 翻页页 clip 多边形 + 底层页 clip 多边形（两个 polygon 点列）
  → 阴影锚点/角度/progress（progress = 折角点已走过的距离比例，含 √2 归一）
```

### 1.2 渲染核 `HTMLRender`（soft 软页模式）

- **翻页页**：`clip-path: polygon(折叠后剩余可见区域)` + `transform: translate3d(pos) rotate(angle)`
- **底层页**：`clip-path: polygon(被揭开后露出的区域)`，无 transform
- **双阴影 div**（关键）：`outerShadow`（投在底层页上）+ `innerShadow`（投在翻页页折痕内侧），
  linear-gradient + rotate + clip-path，宽度/透明度随 progress 变化——
  **"纸张弯曲"的视觉错觉完全来自阴影，页面本身是平面**。
- hard 硬页模式才是 `rotateY` 3D 对折 + 双面（cloneNode 临时拷贝做背面），软页不用。

### 1.3 状态机 `Flip.ts`

READ / USER_FOLD（拖拽折角）/ FOLD_CORNER（悬停折角预览）/ FLIPPING（自动动画）。
动画 = rAF + 预生成插值点列（`GetCordsFromTwoPoint`）逐帧驱动，**固定时长补间**
（flippingTime 默认 1000ms），非物理弹簧。

### 1.4 事件核 `UI.ts`

容器 mousedown/touchstart + window 级 move/up；角落命中区 = 对角线/5；
swipe 判定（250ms + 30px）；桌面端页角悬停折角预览。

### 1.5 页集合 `PageCollection`

**静态全量**：所有页作为独立元素一次性挂载，按下标取 flippingPage/bottomPage。

### 1.6 与我们架构的匹配度

| 维度 | page-flip 假设 | 我们现状 | 冲突 |
| --- | --- | --- | --- |
| 页模型 | 全量页静态存在、每页独立元素 | buffer ±1 章窗口 + 规范流切片 + 短命克隆 | 高 |
| 手势 | 自管 window 级事件 + swipe 判定 | useTouchFlip：Pointer 捕获 + 轴锁定 + fling | 高（双手势打架） |
| 动画 | 固定时长点列插值 | 物理弹簧（速度连续、可打断） | 中（手感割裂） |
| DOM | 接管容器自定尺寸/结构 | PagedReader 分层堆叠 + motion bridge 独占写入 | 高 |
| 交互 | 翻页页元素交互语义弱 | 划线/批注/长按/脚注依赖 DOM 交互 | 中 |

## 2. 三方案对比

### 方案 A：直接使用 page-flip（不推荐）

把页切片克隆喂给 page-flip 的 HTML 模式（portrait 单页）。
- 优点：效果现成，几何/渲染不用写。
- 致命问题：需为它维护"第二套静态页集合"（与 buffer 窗口模型冲突，章节流加载
  需频繁 update 重建）；事件/尺寸/页码是双状态机，同步成本极高；动画是固定插值，
  与我们的弹簧/fling 手感割裂；翻页中划线交互仍不可用；~17KB gzip 新运行时依赖。
- 结论：集成成本高于自研，手感还降级，排除。

### 方案 B：参考 page-flip 自研 CurlRender（推荐）

- 移植几何核 `FlipCalculation`（MIT，纯函数，可逐行对照）；自研渲染层复用
  `PageSurface` / `usePageClones` / motion bridge / 弹簧体系。
- 效果 = page-flip 同款（它本身就是 CSS 方案），手感与覆盖/平移完全同源，
  无新依赖，页模型/手势/提交机制零冲突。
- 效果上限由阴影调参决定，可达掌阅同级。

### 方案 C：WebGL/Canvas 真软页卷曲（不推荐）

需把页 DOM 栅格化为纹理（html2canvas ~100-300ms/页 且低保真），移动端性能与
保真风险双高，工程量最大；掌阅/微信读书 H5 均未采用。排除。

**结论：方案 B。** page-flip 作为"参考书"保留在依赖中，用于几何对拍测试（见 5-T1）。

## 3. 总体设计（方案 B）

数据流：

```
手指点 (x, y)（viewport 相对坐标）
  → core/curl 几何核 calc → CurlFrame {
      angle, position, flippingClip[], bottomClip[],
      shadowOuter{pos/angle/width/opacity}, shadowInner{...}, progress }
  → 渲染层写 4 组 style：翻页页(clip+transform) / 底层页(clip) / 双阴影
  → 松手：提交判定（复用 dx 阈值+fling）→ 点弹簧到目标折角点
  → onComplete → setGlobalPageIndex±1（跨章走既有两阶段转正）
```

### 3.1 层级与页角色（与 cover 同构）

- next（左滑/点右侧）：翻页页 = **当前页规范流本体**，底层页 = 下一页克隆
- prev（右滑/点左侧）：翻页页 = **上一页克隆**，底层页 = 当前页规范流本体
- 克隆创建复用 `usePageClones.createClone(direction)`（方向语义一致，无需改）
- 双阴影元素挂在 stage 层（新增 `curlShadowRootRef`），随帧更新

### 3.2 跟手模型（二维）

- **触点即折角点**（page-flip 同款）：手指在哪，折角点在哪；横滑时 y 自然近似固定，
  自动退化为"横滑翻页"手感；角落捏起自然呈现大折角。无需区分两种交互。
- 折角原点（书脊侧）选择：dx<0→右缘（next），dx>0→左缘（prev）；
  按下点 y < height/2 → 上角，否则下角（决定 angle 符号与 clip 方向）。
- 坐标系：store 只存 viewport 相对坐标；几何核内部按 page-flip 的
  "相对书脊原点"约定换算（next 时 pos.x ∈ [-pageStride, pageStride]）。

### 3.3 手势层适配（零侵入增强）

- reading-store 新增独立 slice：`dragPoint: {x, y} | null` + `setDragPoint`
  （每帧高频更新，与 dragOffset 同级，不进 React state）。
- `useTouchFlip`：pointermove 追加写 dragPoint；pointerdown 记起点；松手置 null。
  **提交判定完全复用现有 dx 语义**（DRAG_THRESHOLD=40 + fling），
  onTurnPage 覆写点不变——覆盖/平移/仿真三模式手感一致。
- 轴锁定逻辑不变：只有锁定 x 轴后才进入折角跟手；锁 y（竖滑）行为同现状。

### 3.4 动画与收尾

- 提交/回弹动画 = **折角点弹簧**：(x, y) 两分量各跑一个 `createSpringAnimation`
  （复用 phase-11 弹簧，PAGE_FLIP_SPRING 参数），目标点：
  - 提交：折角点飞出对侧（x → ∓pageStride，y 保持角部落点）
  - 回弹：折角点回到捏起侧边缘（x → ±pageStride）
  - 初速度：松手 dragReleaseVelocity 的 x 分量映射，速度连续、可打断
- 点击 20%/80% 分区：从页角 (±(pageStride−margin), cornerY) 起播放完整翻页动画
  （page-flip `flip()` 同款），onTurnPage 覆写路径，复用现有 clickSpring。
- flipAnimating 锁、新拖拽打断落定、落幕同步归位（清除 clip-path！）、
  跨章两阶段转正、scheduleBufferRebalance 补跑——全部与 cover 同构复用。

### 3.5 首末页（无相邻页）

- 不建克隆；当前页做**小幅折角 + 回弹**（折角点位移按阻尼衰减，progress 封顶 ~15%），
  松手弹簧回弹。比覆盖模式的平移阻尼更有"纸张拉不动"的质感，实现量小。
  （备选：回退覆盖阻尼位移，作为降级开关。）

### 3.6 兼容性保障（零迁移承诺延续）

- 划线/批注：翻页页（规范流本体或带 marks 的克隆）clip-path 只影响渲染不影响 DOM；
  翻页结束必须完全清除 clip-path/clip 相关 style（motion bridge 落幕归位负责）。
- 长按选区/脚注/目录跳转/进度还原/TTS 跟随：手势与提交机制复用，行为不变。
- 降级：`clip-path: polygon()` 现代浏览器全支持；仍保留探测兜底——
  不支持时 simulation 渲染回退 cover（现有回退路径保留）。
- jsdom 测试环境：几何核纯函数可测；渲染层走 mock。

## 4. 文件清单（新增/修改）

### 新增

```
packages/reader/src/core/curl/
  calculation.ts        # FlipCalculation 移植（纯函数，MIT 出处标注）
  types.ts              # CurlFrame/CurlCorner/Point 等
  clip-path.ts          # 点列 → CSS polygon 序列化
packages/reader/src/core/__tests__/curl-calculation.test.ts
  # 含与 page-flip FlipCalculation 的数值对拍（oracle 测试）
packages/reader/src/components/content/paged/curl/
  useCurlMotionBridge.ts  # 对标 useCoverMotionBridge：subscribe+rAF 合帧+弹簧
  curl.css                # 双阴影元素/stage 层叠/will-change
```

### 修改

```
packages/reader/src/store/reading-store.ts
  # + dragPoint slice（独立高频 slice）
packages/reader/src/hooks/useTouchFlip.ts
  # + pointermove/down/up 写 dragPoint（判定逻辑零改动）
packages/reader/src/components/content/paged/PagedReader.tsx
  # + mode 分支（cover | simulation）：克隆生命周期/提交回弹/点击动画共用，
  #   跟手渲染走 useCurlMotionBridge；首末页折角回弹
packages/reader/src/components/content/paged/paged-reader.css
  # + 仿真模式阴影/层叠样式
packages/reader/src/components/content/ReaderContent.tsx
  # simulation → PagedReader mode='simulation'（替换现有 cover 回退）
packages/reader/src/components/settings/SettingsPanel.tsx
  # 解除仿真置灰，删 PHASE10_GUARD；四档全部可选
```

## 5. 任务分解

| # | 任务 | 产出 | 预估 |
| --- | --- | --- | --- |
| T1 | core/curl 几何核移植 + 单测（含 page-flip oracle 对拍） | calculation/clip-path/types + test | 0.5d |
| T2 | dragPoint slice + useTouchFlip 写点 + 单测 | store/hook 修改 + test | 0.25d |
| T3 | useCurlMotionBridge + curl.css（跟手渲染/双阴影/点弹簧/打断/落幕归位） | bridge + css | 1d |
| T4 | PagedReader 集成 simulation 模式（克隆复用/提交回弹/首末页/点击动画） | PagedReader 改造 | 0.75d |
| T5 | SettingsPanel 解除置灰 + ReaderContent 分发 | 设置/分发 | 0.25d |
| T6 | 测试与验收（几何对拍/bridge 逻辑/性能采样/全量回归） | 测试 + STATUS 更新 | 0.5d |
| T7 | （可选 P1）翻过半程"页背面"层（当前页镜像+纸张色罩）；桌面端页角悬停折角预览 | 增强 | 0.5d |

合计：核心 ~3.25d；含可选增强 ~3.75d。

## 6. 验收标准

1. 右下/左下角捏起，折痕跟随手指二维移动；双阴影随 progress 弯曲变化，有纸张感
2. 全页横滑等效翻页；松手按 40px 阈值/fling 提交或回弹；弹簧速度连续、可打断
3. 点击左右 20% 分区播放完整翻页动画（页角起翻到对侧）
4. 跨章翻页无缝：克隆源 marks 完整、两阶段转正、动画期缓冲锁生效
5. 翻页结束后规范流 clip-path 完全清除；划线/批注/脚注/目录跳转/进度还原/TTS 正常
6. 中低端机拖拽跟手稳定 60fps（每帧 ≤ 4 元素 style 写入，无强制同步布局）
7. 覆盖/平移/竖滚三模式零回归；`pnpm -r test` 全绿

## 7. 风险与对策

| 风险 | 对策 |
| --- | --- |
| clip-path 每帧重算的 paint 开销（中低端机） | 参与元素仅 2 页 + 2 阴影；will-change: clip-path；必要时阴影降级为单层；性能采样纳入验收 |
| 几何移植正确性 | 单测与 page-flip `FlipCalculation` 数值对拍（包已安装，测试直接 import 作 oracle） |
| 翻页页=规范流本体时 clip 残留裁剪正文 | motion bridge 落幕归位强制清除全部 clip/transform；增加兜底断言 |
| 二维跟手与轴锁定冲突 | 仅锁 x 后进入折角；锁 y 走原有竖向手势，行为不变 |
| 首末页折角阻尼手感 | progress 封顶 + 弹簧回弹，参数可拨杆；保留回退覆盖阻尼的降级开关 |
| 弹簧双分量 (x,y) 收尾不同步 | 共用同一时钟步进；以 x 分量落定为准（y 同步 snap） |

## 8. 待决策点（执行前确认）

1. **方案**：A 直接用 page-flip / **B 自研（推荐）** / C WebGL
2. **跟手模型**：触点即折角点（推荐，page-flip 同款）/ 仅横滑映射固定角落
3. **首末页**：小幅折角+回弹（推荐）/ 回退覆盖阻尼位移
4. **T7 增强**：页背面层 + 桌面悬停折角预览，本期做 / 下期做（建议下期）
