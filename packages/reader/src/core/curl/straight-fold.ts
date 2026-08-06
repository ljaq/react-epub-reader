/**
 * 仿真翻页「直线折痕」模型（phase-14 增强）——右侧中部起翻（业内常见仿真翻页）。
 *
 * 与 curl/calculation 的「对角折角」模型并列：
 * - 对角折角：从页角（上下角）揭起，折痕为页角到对边的对角线，卷边倾斜；
 * - 直线折痕：从右侧中部揭起（next），折痕为**竖直线** x=creaseX，卷边（自由边）
 *   竖直、不倾斜，纸张条 [creaseX, w] 沿竖直折痕向后翻折。
 *
 * 几何（next，页坐标 = viewport 坐标）：
 * - 手指 fingerX ∈ [-w, w]（w=静止，0=半翻，-w=完全翻过）；
 * - 折痕 creaseX = (w + fingerX) / 2（finger 与右缘中点的中垂线 = 竖直）；
 * - flap 源条 = [creaseX, w] × [0, h]，沿 x=creaseX 反射后落 [fingerX, creaseX]；
 * - 底层显露区 = [creaseX, w]（flap 揭起后露出下一页）；
 * - progress = (w - fingerX) / w ∈ [0, 2]（仅 0..1 用于阴影宽度）。
 *
 * flap 背面 = 反射矩阵 matrix(-1, 0, 0, 1, w+fingerX, 0)（x → w+fingerX - x），
 * clip = 源条 [creaseX, w]²（局部坐标，反射后屏幕落 [fingerX, creaseX]）。
 */
import type { CurlDirection } from './types'

export interface StraightFoldFrame {
  direction: CurlDirection
  /** 折痕 x（页坐标），竖直 */
  creaseX: number
  /** 手指 x（页坐标），flap 自由边落点 */
  fingerX: number
  /** 翻页进度（0=静止，1=半翻，2=完全翻过；阴影按 min(progress,1) 计算） */
  progress: number
  w: number
  h: number
}

/** 计算直线折痕帧（仅 next 方向；fingerX 不做强制 clamp，允许 spring 飞到 -w） */
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

/** flap 样式（背面竖直镜像）：transform = 反射矩阵，clip = 源条矩形 */
export function buildStraightFlapStyle(frame: StraightFoldFrame): {
  transform: string
  clipPath: string
} {
  const { creaseX, fingerX, w, h } = frame
  const t = w + fingerX // x → t - x
  const x0 = creaseX
  const x1 = w
  return {
    transform: `matrix(-1, 0, 0, 1, ${t.toFixed(2)}, 0)`,
    clipPath: `polygon(${x0.toFixed(2)}px 0px, ${x1.toFixed(2)}px 0px, ${x1.toFixed(2)}px ${h.toFixed(2)}px, ${x0.toFixed(2)}px ${h.toFixed(2)}px)`
  }
}

/** 底层显露区 clip（[creaseX, w]²；仅 next） */
export function buildStraightBottomClip(frame: StraightFoldFrame): string | null {
  if (frame.direction !== 1) return null
  const { creaseX, w, h } = frame
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

/** 直线折痕阴影：outer=显露侧（折痕右）、crease=平铺侧（折痕左，淡）、inner=flap 侧（折痕右，窄） */
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
  // inner：flap 侧窄带，不越过页右缘
  const width = Math.min((w * 0.75 * p * 3) / 4, Math.max(0, w - creaseX))
  const op = 1 - p
  return {
    left: creaseX,
    width,
    height: h,
    background: `linear-gradient(to right, rgba(0, 0, 0, ${op.toFixed(3)}), rgba(0, 0, 0, 0))`
  }
}
