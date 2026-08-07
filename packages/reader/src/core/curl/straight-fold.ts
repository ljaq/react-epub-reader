/**
 * 仿真翻页「直线折痕」模型（phase-14 增强）——中部竖直折痕（掌阅级对称卷边）。
 *
 * 与 curl/calculation 的「对角折角」模型并列：
 * - 对角折角：从页角（上下角）揭起，折痕为页角到对边的对角线，卷边倾斜；
 * - 直线折痕：中部竖直折痕，卷边（自由边）竖直、不倾斜。
 *
 * 两方向共用同一套 fingerX 几何（左滑怎么过去，右滑原路回来）：
 * - fingerX ∈ [-w, w]（w=完全放平，0=半翻，-w=完全翻到左侧外）；
 * - 折痕 creaseX = (w + fingerX) / 2；
 * - flap 源条 = [creaseX, w]，反射 matrix(-1,0,0,1,w+fingerX,0) 呈纸张背面；
 * - progress = (w - fingerX) / w（阴影按 min(progress,1)）。
 *
 * 层含义：
 * - next：flap=当前页背面卷出；底层克隆=下一页，clip [creaseX, w]；
 * - prev：flap=上一页背面卷边；底层克隆=上一页已放平区，clip [0, creaseX]
 *   （fingerX 从 -w 增到 w = 新页向右放平，而非向右卷起）。
 */
import type { CurlDirection } from './types'

export interface StraightFoldFrame {
  direction: CurlDirection
  /** 折痕 x（页坐标），竖直 */
  creaseX: number
  /** 手指 x（页坐标），flap 自由边落点 */
  fingerX: number
  /** 翻页进度（0=放平，1=半翻，2=完全翻过；阴影按 min(progress,1) 计算） */
  progress: number
  w: number
  h: number
}

/** 计算直线折痕帧（两方向同一公式；fingerX 不做强制 clamp，允许 spring 飞过端点） */
export function computeStraightFold(
  fingerX: number,
  direction: CurlDirection,
  w: number,
  h: number
): StraightFoldFrame | null {
  if (w <= 0 || h <= 0) return null
  const fx = fingerX
  const creaseX = (w + fx) / 2
  const progress = (w - fx) / w
  return { direction, creaseX, fingerX: fx, progress, w, h }
}

/** flap 样式（背面竖直镜像）：transform = 反射矩阵，clip = 源条 [creaseX, w] */
export function buildStraightFlapStyle(frame: StraightFoldFrame): {
  transform: string
  clipPath: string
} {
  const { creaseX, fingerX, w, h } = frame
  const t = w + fingerX
  const x0 = creaseX
  const x1 = w
  return {
    transform: `matrix(-1, 0, 0, 1, ${t.toFixed(2)}, 0)`,
    clipPath: `polygon(${x0.toFixed(2)}px 0px, ${x1.toFixed(2)}px 0px, ${x1.toFixed(2)}px ${h.toFixed(2)}px, ${x0.toFixed(2)}px ${h.toFixed(2)}px)`
  }
}

/**
 * 底层克隆 clip：
 * - next：显露下一页 [creaseX, w]
 * - prev：上一页已放平区 [0, creaseX]（随 fingerX→w 向右扩大至整页）
 */
export function buildStraightBottomClip(frame: StraightFoldFrame): string | null {
  const { direction, creaseX, w, h } = frame
  if (direction === -1) {
    const x1 = Math.min(w, Math.max(0, creaseX))
    if (x1 <= 0) {
      return 'polygon(0px 0px, 0px 0px, 0px 0px)'
    }
    return `polygon(0px 0px, ${x1.toFixed(2)}px 0px, ${x1.toFixed(2)}px ${h.toFixed(2)}px, 0px ${h.toFixed(2)}px)`
  }
  const x0 = Math.max(0, creaseX)
  return `polygon(${x0.toFixed(2)}px 0px, ${w.toFixed(2)}px 0px, ${w.toFixed(2)}px ${h.toFixed(2)}px, ${x0.toFixed(2)}px ${h.toFixed(2)}px)`
}

/** 直线折痕的三段阴影参数（轴对齐，无需旋转几何） */
export type StraightShadowKind = 'outer' | 'crease' | 'inner'

export interface StraightShadowStyle {
  left: number
  width: number
  height: number
  background: string
}

/**
 * 直线折痕阴影（两方向几何相同）：
 * outer=折痕右（被盖/显露侧）、crease=折痕左淡影、inner=flap 侧窄带。
 */
export function buildStraightShadowStyle(
  frame: StraightFoldFrame,
  kind: StraightShadowKind
): StraightShadowStyle | null {
  const { creaseX, progress, w, h } = frame
  const p = Math.max(0, Math.min(1, progress))
  if (p <= 0) return null
  if (kind === 'outer') {
    const width = w * 0.75 * p
    const op = (1 - p) * 0.45
    return {
      left: creaseX,
      width,
      height: h,
      background: `linear-gradient(to right, rgba(0, 0, 0, ${op.toFixed(3)}), rgba(0, 0, 0, 0))`
    }
  }
  if (kind === 'crease') {
    const width = (w * 0.75 * p) / 2
    const op = (1 - p) * 0.16
    return {
      left: creaseX - width,
      width,
      height: h,
      background: `linear-gradient(to left, rgba(0, 0, 0, ${op.toFixed(3)}), rgba(0, 0, 0, 0))`
    }
  }
  const width = Math.min((w * 0.75 * p * 3) / 4, Math.max(0, w - creaseX))
  const op = 1 - p
  return {
    left: creaseX,
    width,
    height: h,
    background: `linear-gradient(to right, rgba(0, 0, 0, ${op.toFixed(3)}), rgba(0, 0, 0, 0))`
  }
}
