import { describe, it, expect } from 'vitest'
import {
  buildStraightBottomClip,
  buildStraightFlapStyle,
  buildStraightShadowStyle,
  computeStraightFold
} from '../curl/straight-fold'

const W = 360
const H = 700

describe('straight-fold 中部竖直折痕（viewport 同构）', () => {
  it('fingerX=180 → creaseX=270, progress=0.5（两方向相同）', () => {
    const next = computeStraightFold(180, 1, W, H)!
    const prev = computeStraightFold(180, -1, W, H)!
    expect(next.creaseX).toBe(270)
    expect(prev.creaseX).toBe(270)
    expect(next.progress).toBeCloseTo(0.5, 5)
  })

  it('flap 反射与 clip 源条 [creaseX, w]', () => {
    const style = buildStraightFlapStyle(computeStraightFold(180, 1, W, H)!)
    expect(style.transform).toBe('matrix(-1, 0, 0, 1, 540.00, 0)')
    expect(style.clipPath).toContain('270.00px 0px')
  })

  it('next 底层 [creaseX,w]；prev 已放平 [0,creaseX]', () => {
    const next = buildStraightBottomClip(computeStraightFold(180, 1, W, H)!)!
    const prev = buildStraightBottomClip(computeStraightFold(180, -1, W, H)!)!
    expect(next).toContain('270.00px 0px')
    expect(next).toContain('360.00px 0px')
    expect(prev).toContain('0px 0px')
    expect(prev).toContain('270.00px 0px')
  })

  it('阴影 outer 在折痕右；progress=0 为 null', () => {
    const outer = buildStraightShadowStyle(computeStraightFold(180, 1, W, H)!, 'outer')!
    expect(outer.left).toBe(270)
    expect(buildStraightShadowStyle(computeStraightFold(W, 1, W, H)!, 'outer')).toBeNull()
  })
})
