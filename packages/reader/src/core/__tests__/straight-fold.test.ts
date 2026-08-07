import { describe, it, expect } from 'vitest'
import {
  buildStraightBottomClip,
  buildStraightFlapStyle,
  buildStraightShadowStyle,
  computeStraightFold
} from '../curl/straight-fold'

const W = 360
const H = 700

describe('straight-fold 共用几何（fingerX: w=放平，-w=翻出）', () => {
  it('折痕与进度：fingerX=180 → creaseX=270, progress=0.5（两方向相同）', () => {
    const next = computeStraightFold(180, 1, W, H)!
    const prev = computeStraightFold(180, -1, W, H)!
    expect(next.creaseX).toBe(270)
    expect(prev.creaseX).toBe(270)
    expect(next.progress).toBeCloseTo(0.5, 5)
    expect(prev.progress).toBeCloseTo(0.5, 5)
  })

  it('fingerX=w → 完全放平；fingerX=-w → 完全翻出', () => {
    expect(computeStraightFold(W, 1, W, H)!.progress).toBeCloseTo(0, 5)
    expect(computeStraightFold(-W, -1, W, H)!.progress).toBeCloseTo(2, 5)
  })

  it('flap 反射矩阵与 clip 源条 [creaseX, w]（两方向相同）', () => {
    const frame = computeStraightFold(180, -1, W, H)!
    const style = buildStraightFlapStyle(frame)
    expect(style.transform).toBe('matrix(-1, 0, 0, 1, 540.00, 0)')
    expect(style.clipPath).toContain('270.00px 0px')
    expect(style.clipPath).toContain('360.00px 0px')
  })

  it('next 底层 clip = [creaseX, w]；prev 底层 clip = [0, creaseX]（已放平区）', () => {
    const next = computeStraightFold(180, 1, W, H)!
    const prev = computeStraightFold(180, -1, W, H)!
    expect(buildStraightBottomClip(next)).toContain('270.00px 0px')
    expect(buildStraightBottomClip(next)).toContain('360.00px 0px')
    const prevClip = buildStraightBottomClip(prev)!
    expect(prevClip).toContain('0px 0px')
    expect(prevClip).toContain('270.00px 0px')
    expect(prevClip).not.toContain('360.00px 0px')
  })

  it('prev 在 fingerX≤-w 时已放平区为空（尚未铺入）', () => {
    const frame = computeStraightFold(-W, -1, W, H)!
    expect(buildStraightBottomClip(frame)).toBe('polygon(0px 0px, 0px 0px, 0px 0px)')
  })

  it('阴影 outer 在折痕右侧；progress=0 时为 null', () => {
    const frame = computeStraightFold(180, -1, W, H)!
    const outer = buildStraightShadowStyle(frame, 'outer')!
    expect(outer.left).toBe(frame.creaseX)
    expect(outer.background).toContain('to right')
    expect(buildStraightShadowStyle(computeStraightFold(W, -1, W, H)!, 'outer')).toBeNull()
  })
})
