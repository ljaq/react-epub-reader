/**
 * 仿真翻页「直线折痕」模型——中部竖直折痕（与对角折角并列）。
 *
 * - 对角折角：起滑靠近上下角，折痕倾斜；
 * - 直线折痕：起滑在中部带，折痕竖直，卷边不倾斜。
 *
 * 两方向共用 fingerX 几何（viewport 同构）：
 * - fingerX ∈ [-w, w]（w=放平，0=半翻，-w=翻到左侧外）；
 * - creaseX = (w + fingerX) / 2；
 * - flap 源条 [creaseX, w]，反射呈纸张背面；
 * - next 底层显露 [creaseX, w]；prev 已放平区 [0, creaseX]。
 */
import type { CurlDirection } from './types'

export interface StraightFoldFrame {
  direction: CurlDirection
  creaseX: number
  fingerX: number
  progress: number
  w: number
  h: number
}

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

export function buildStraightFlapStyle(frame: StraightFoldFrame): {
  transform: string
  clipPath: string
} {
  const { creaseX, fingerX, w, h } = frame
  const t = w + fingerX
  return {
    transform: `matrix(-1, 0, 0, 1, ${t.toFixed(2)}, 0)`,
    clipPath: `polygon(${creaseX.toFixed(2)}px 0px, ${w.toFixed(2)}px 0px, ${w.toFixed(2)}px ${h.toFixed(2)}px, ${creaseX.toFixed(2)}px ${h.toFixed(2)}px)`
  }
}

export function buildStraightBottomClip(frame: StraightFoldFrame): string | null {
  const { direction, creaseX, w, h } = frame
  if (direction === -1) {
    const x1 = Math.min(w, Math.max(0, creaseX))
    if (x1 <= 0) return 'polygon(0px 0px, 0px 0px, 0px 0px)'
    return `polygon(0px 0px, ${x1.toFixed(2)}px 0px, ${x1.toFixed(2)}px ${h.toFixed(2)}px, 0px ${h.toFixed(2)}px)`
  }
  const x0 = Math.max(0, creaseX)
  return `polygon(${x0.toFixed(2)}px 0px, ${w.toFixed(2)}px 0px, ${w.toFixed(2)}px ${h.toFixed(2)}px, ${x0.toFixed(2)}px ${h.toFixed(2)}px)`
}

export type StraightShadowKind = 'outer' | 'crease' | 'inner'

export interface StraightShadowStyle {
  left: number
  width: number
  height: number
  background: string
}

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
