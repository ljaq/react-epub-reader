# React EPUB Reader 迁移 Plans

本目录是「Vue 阅读器 → React 无状态阅读器」迁移的**总架构师基线**。所有子 Agent 以本目录的 plan 为执行依据。

## 文件结构

| 文件 | 角色 | 维护者 |
|---|---|---|
| `00-总览与契约.md` | **冻结契约**（types / props / callbacks）+ 总览大纲 + Phase 依赖图 | 总架构师 |
| `phase-00-monorepo基建.md` | Phase 0：pnpm monorepo + 三包骨架 | 总架构师亲自执行 |
| `phase-01-引擎纯函数.md` | Phase 1（子 Agent A）：core/ 纯函数移植 + 单测 | 子 Agent A |
| `phase-02-阅读引擎UI.md` | Phase 2（子 Agent B）：双模式阅读引擎 + buffer hooks | 子 Agent B |
| `phase-03-壳层设置目录.md` | Phase 3（子 Agent C）：壳层 / 设置 / 字体 / 目录 + 插槽 | 子 Agent C |
| `phase-04-选中划线批注.md` | Phase 4（子 Agent D）：选中 / 划线 / 批注 + 乐观 UI | 子 Agent D |
| `phase-05-笔记中心书签进度.md` | Phase 5（子 Agent E）：笔记中心 / 书签 / 进度 / 试读 | 子 Agent E |
| `phase-06-TTS.md` | Phase 6（子 Agent F）：TTS 引擎 + 播放器 UI | 子 Agent F |
| `phase-07-EpubAdapter.md` | Phase 7（子 Agent G）：epub-adapter 包 | 子 Agent G |
| `phase-08-H5宿主API.md` | Phase 8（子 Agent H）：API 迁移 + ReaderHost 桥接 | 子 Agent H |
| `phase-09-收尾验收.md` | Phase 9（子 Agent I）：富媒体 / 书CSS / 随感示例 / 视觉验收 | 子 Agent I |
| `phase-10-真分页与覆盖翻页.md` | Phase 10（总架构师）：掌阅级覆盖模式 / PageSurface / 克隆页 / 跨章转正 | 总架构师 |
| `phase-11-性能与物理翻页.md` | Phase 11（总架构师）：拖拽旁路 React / 弹簧翻页 / fling / HTML LRU 缓存 / 长按选区修复 | 总架构师 |

## 工作流（总架构师 ↔ 子 Agent）

```
总架构师（你与我）
  │
  ├─ 0. 维护 00-总览与契约.md（冻结契约，唯一真理源）
  ├─ 1. 按依赖顺序逐个启动子 Agent（见各 phase 的「启动提示词」）
  ├─ 2. 子 Agent 执行其 phase plan，完成后输出「交付与自查报告」
  └─ 3. 总架构师验收：契约一致性 + Vue 1:1 parity + 跨 phase 边界
        ├─ 通过 → 标记 phase done，启动下一 phase
        └─ 不通过 → 反馈整改项，子 Agent 修订后重新验收
```

### 子 Agent 通用工作要求（每个 phase 都必须遵守）

1. **三读**：先读本 phase plan（含「源码对应关系」一节）→ 再读 `00-总览与契约.md` → 最后只读对照 `old-vue-reader/` 对应源码与设计图。
2. **源码优先**：`old-vue-reader/` 的 **PRD/cursor-plan 文档可能偏旧**，**源码是真理**。plan 里的「源码对应关系」给出文件:行号导航，但移植以源码实际内容为准；行号会随源码变动，遇到对不上时搜符号名定位。
3. **契约优先**：`00-总览与契约.md` 是冻结的。如发现契约缺口，**不得擅自改契约**，在自查报告里「契约疑问」一节提出，等总架构师裁定。
4. **只读 Vue**：`old-vue-reader/` 禁止任何修改（已 `.gitignore`）。所有新代码落 `packages/*` 或 `apps/*`。
5. **1:1 parity**：UI 布局、视觉、手势、文案、动效、边界常量必须与 Vue 版完全一致。允许改的只有代码架构。
6. **交付前自查**：每个 phase 末尾有「Vue 对照自查表」，子 Agent 必须逐项勾选并附证据（文件:行号 或 截图说明）。
7. **不跨边界**：只动本 phase plan 明确列出的文件。若需改其他 phase 的文件，在自查报告「跨 phase 依赖」一节提出。
8. **不引入新依赖**：除 `package.json` 已有的（react/zustand/epubjs/vitest 等），新增依赖须在自查报告申请。
9. **构建通过**：交付前 `pnpm -w build` 与 `pnpm -w test`（如该 phase 含单测）必须通过。

### 子 Agent 交付与自查报告格式

子 Agent 完成后，必须按此格式输出（供总架构师验收）：

```
## 交付与自查报告 — Phase X（子 Agent Y）

### 1. 完成项
- [x] 任务清单项1 — 落点 `packages/reader/src/...:行号`
- ...

### 2. Vue 对照自查表
- [x] 常量/数值项 — Vue `old-vue-reader/...:行号` = React `...:行号`，值一致
- [x] 交互项 — 描述 + 证据
- ...

### 3. 契约疑问（如有）
- 描述：... 期望裁定：...

### 4. 跨 phase 依赖（如有）
- 需 Phase N 的 X 文件调整 Y，原因：...

### 5. 构建与测试
- `pnpm -w build`：通过 / 失败原因
- `pnpm -w test`：通过 / 覆盖率说明

### 6. 已知遗留
- ...
```

### 总架构师验收清单（每个 phase 验收时执行）

- [ ] 契约一致性：实现是否严格遵循 `00-总览与契约.md` 的 types/props/callbacks
- [ ] Vue 1:1 parity：自查表每项抽查 2–3 项对照 Vue 源码复核
- [ ] 边界纯净：reader 包内无 `fetch`/`USE_MOCK`/路由引用；host 侧无阅读器内部状态写入
- [ ] 跨 phase 不污染：未越界改动其他 phase 文件（或已登记并裁定）
- [ ] 构建通过：`pnpm -w build` 通过；该 phase 单测通过
- [ ] 文档同步：相关 README/契约更新已落盘

## 启动顺序

```
Phase 0（总架构师）→ Phase 1（A）─┬→ Phase 2（B）─┬→ Phase 3（C）→ Phase 6（F）
                                 │              ├→ Phase 4（D）→ Phase 5（E）
                                 │              └→ Phase 7（G，可与 B 并行，需 Phase 0 契约冻结）
                                 └→ Phase 8（H，贯穿，每 phase 都需其 mock 接口）
                                       Phase 9（I，最后收尾）
```

> Phase 8（H5 宿主）贯穿全程：每完成一个 phase，H 需提供对应 mock 接口与 ReaderHost 桥接更新。H 不阻塞单 phase 启动，但 phase 验收需 H 侧 mock 可跑通。
