/**
 * core/curl 几何核单测（phase-14）。
 *
 * golden 值已与 page-flip@2.0.7 原版 FlipCalculation TS 源码（随包分发）逐位对拍
 * （页宽 360 × 页高 700）：折角点 (180,350) 经圆约束修正到 (164.65, 379.86)，
 * progress≈0.2713，sideIntersect≈(360, 479.20)，bottomIntersect≈(1.84, 700)。
 */
import { describe, it, expect } from 'vitest'
// page-flip 随包分发 TS 源码作 oracle（模块声明见 src/page-flip-src.d.ts，值为 any）
import { FlipCalculation } from 'page-flip/src/Flip/FlipCalculation'
import { FlipCorner, FlipDirection } from 'page-flip/src/Flip/Flip'
import {
  CurlCalculation,
  calcCurlFrame,
  clampCurlDragPoint,
  getCurlClickStartPoint,
  getCurlCommitPoint,
  getCurlRestPoint,
  getDampedCurlPoint,
  lerpCurlPoint,
  projectVelocityToPath,
  resolveCurlCorner,
  toCurlPagePoint
} from '../curl'
import {
  buildBottomPageClipPath,
  buildCreaseShadowStyle,
  buildFlippingBackFaceStyle,
  buildFlippingPageStyle,
  buildInnerShadowStyle,
  buildLandedPageClipPath,
  buildOuterShadowStyle
} from '../curl/render-style'

const W = 360
const H = 700

describe('CurlCalculation 退化与边界', () => {
  it('静止角点 (W, 0) top corner：calc 返回 false（Point is too small）', () => {
    const calc = new CurlCalculation(1, 'top', W, H)
    expect(calc.calc({ x: W, y: 0 })).toBe(false)
  })

  it('静止角点 (W, H) bottom corner：calc 返回 false（共线抛错被捕获）', () => {
    const calc = new CurlCalculation(1, 'bottom', W, H)
    expect(calc.calc({ x: W, y: H })).toBe(false)
  })

  it('calcCurlFrame 对退化输入返回 null', () => {
    const calc = new CurlCalculation(1, 'top', W, H)
    expect(calcCurlFrame(calc, { x: W, y: 0 })).toBeNull()
  })
})

describe('CurlCalculation golden：next + bottom corner，折角点 (180, 350)', () => {
  const calc = new CurlCalculation(1, 'bottom', W, H)
  const frame = calcCurlFrame(calc, { x: 180, y: 350 })

  it('calc 成功，折角点经圆约束修正到 (164.65, 379.86)', () => {
    expect(frame).not.toBeNull()
    expect(frame!.position.x).toBeCloseTo(164.65, 1)
    expect(frame!.position.y).toBeCloseTo(379.86, 1)
  })

  it('progress ≈ 0.2713', () => {
    expect(frame!.progress).toBeCloseTo(0.2713, 3)
  })

  it('getAngle（方向符号调整后）≈ 2.0405 rad', () => {
    expect(frame!.angle).toBeCloseTo(2.0405, 2)
  })

  it('翻页页 clip 多边形：null 已过滤前的结构正确（side≈(360,479.20)，bottom≈(1.84,700)）', () => {
    const clip = frame!.flippingClip
    // [topLeft, topIntersect(null), side, bottom, bottomLeft]
    expect(clip[1]).toBeNull()
    const side = clip[2]!
    const bottom = clip[3]!
    expect(side.x).toBeCloseTo(W, 1)
    expect(side.y).toBeCloseTo(479.2, 1)
    expect(bottom.x).toBeCloseTo(1.84, 1)
    expect(bottom.y).toBeCloseTo(H, 1)
  })

  it('阴影锚点 = sideIntersect（bottom corner 优先 side）', () => {
    expect(frame!.shadowStart).not.toBeNull()
    expect(frame!.shadowStart!.x).toBeCloseTo(W, 1)
    expect(frame!.shadowStart!.y).toBeCloseTo(479.2, 1)
  })

  it('shadowAngle 落在折痕方向合理区间', () => {
    expect(frame!.shadowAngle).toBeGreaterThan(2.3)
    expect(frame!.shadowAngle).toBeLessThan(2.9)
  })
})

describe('CurlCalculation 不变量', () => {
  it('progress 随折角点左移单调递增（bottom corner 扫掠）', () => {
    const calc = new CurlCalculation(1, 'bottom', W, H)
    let last = -1
    for (let x = W - 20; x >= 20; x -= 40) {
      const frame = calcCurlFrame(calc, { x, y: H - 30 })
      if (!frame) continue
      expect(frame.progress).toBeGreaterThanOrEqual(last)
      last = frame.progress
    }
    expect(last).toBeGreaterThan(0.3)
  })

  it('prev 方向（页坐标镜像）计算成功且数值有限', () => {
    const calc = new CurlCalculation(-1, 'bottom', W, H)
    const frame = calcCurlFrame(calc, { x: -120, y: 420 })
    expect(frame).not.toBeNull()
    expect(Number.isFinite(frame!.angle)).toBe(true)
    expect(frame!.progress).toBeGreaterThan(0)
    expect(frame!.progress).toBeLessThanOrEqual(1.5)
  })

  it('top corner 计算成功', () => {
    const calc = new CurlCalculation(1, 'top', W, H)
    const frame = calcCurlFrame(calc, { x: 160, y: 260 })
    expect(frame).not.toBeNull()
    expect(frame!.progress).toBeGreaterThan(0)
  })
})

describe('page-flip 原版 oracle 数值对拍', () => {
  // 多组折角点 × 两角部 × 两方向：position/angle/progress/clip/shadowStart 必须与
  // 原版 FlipCalculation 逐位一致（移植正确性的直接证据，替代手工 golden）。
  const cases: { pos: { x: number; y: number }; corner: 'top' | 'bottom' }[] = [
    { pos: { x: 180, y: 350 }, corner: 'bottom' },
    { pos: { x: 300, y: 650 }, corner: 'bottom' },
    { pos: { x: 90, y: 680 }, corner: 'bottom' },
    { pos: { x: 40, y: 300 }, corner: 'bottom' },
    { pos: { x: 160, y: 260 }, corner: 'top' },
    { pos: { x: 320, y: 60 }, corner: 'top' },
    { pos: { x: 60, y: 120 }, corner: 'top' }
  ]

  for (const direction of [1, -1] as const) {
    for (const { pos, corner } of cases) {
      it(`direction=${direction} corner=${corner} pos=(${pos.x},${pos.y}) 逐位一致`, () => {
        const orig = new FlipCalculation(
          direction === 1 ? FlipDirection.FORWARD : FlipDirection.BACK,
          corner === 'bottom' ? FlipCorner.BOTTOM : FlipCorner.TOP,
          String(W),
          String(H)
        )
        const mine = new CurlCalculation(direction, corner, W, H)
        const p = direction === 1 ? pos : { x: -pos.x, y: pos.y }
        const origOk = orig.calc(p)
        const mineOk = mine.calc(p)
        expect(mineOk).toBe(origOk)
        if (!origOk) return

        expect(mine.getPosition().x).toBeCloseTo(orig.getPosition().x, 10)
        expect(mine.getPosition().y).toBeCloseTo(orig.getPosition().y, 10)
        expect(mine.getAngle()).toBeCloseTo(orig.getAngle(), 10)
        // 原版 progress 为 0-100，本移植归一为 0-1
        expect(mine.getFlippingProgress()).toBeCloseTo(orig.getFlippingProgress() / 100, 10)

        const origClip = orig.getFlippingClipArea()
        const mineClip = mine.getFlippingClipArea()
        expect(mineClip.length).toBe(origClip.length)
        for (let i = 0; i < origClip.length; i++) {
          const o = origClip[i] as { x: number; y: number } | null
          const m = mineClip[i]
          expect(m === null).toBe(o === null)
          if (o && m) {
            expect(m.x).toBeCloseTo(o.x, 10)
            expect(m.y).toBeCloseTo(o.y, 10)
          }
        }

        const origShadow = orig.getShadowStartPoint() as { x: number; y: number } | null
        const mineShadow = mine.getShadowStartPoint()
        expect(mineShadow === null).toBe(origShadow === null)
        if (origShadow && mineShadow) {
          expect(mineShadow.x).toBeCloseTo(origShadow.x, 10)
          expect(mineShadow.y).toBeCloseTo(origShadow.y, 10)
          expect(mine.getShadowAngle()).toBeCloseTo(orig.getShadowAngle(), 10)
        }
      })
    }
  }
})

describe('render-style 样式构建', () => {
  const calc = new CurlCalculation(1, 'bottom', W, H)
  const frame = calcCurlFrame(calc, { x: 180, y: 350 })!

  it('翻页页样式：translate3d + rotate + polygon', () => {
    const style = buildFlippingPageStyle(frame, 1)
    expect(style.transform).toMatch(/^translate3d\(-?\d+\.\d+px, -?\d+\.\d+px, 0\) rotate\(-?[\d.]+rad\)$/)
    expect(style.clipPath).toMatch(/^polygon\(/)
    // null 项已过滤，剩余 4 个顶点
    expect(style.clipPath.match(/-?\d+\.\d+px -?\d+\.\d+px/g)!.length).toBe(4)
  })

  it('prev 方向：翻页页 translate 锚点 = 活动角 topRight 镜像', () => {
    const calcBack = new CurlCalculation(-1, 'bottom', W, H)
    const backFrame = calcCurlFrame(calcBack, { x: -180, y: 350 })!
    const style = buildFlippingPageStyle(backFrame, -1)
    // 锚点 = getActiveCorner（prev=rect.topRight）；convertToGlobal(prev): x = -anchor.x
    const expectedX = -backFrame.pageRect.topRight.x
    expect(style.transform).toContain(`translate3d(${expectedX.toFixed(2)}px`)
  })

  it('翻页页锚点 = 活动角（next=rect.topLeft）：内容随折痕旋转的关键不变量', () => {
    // 与 page-flip drawSoft 对齐：锚点必须是活动角而非折角点 position，
    // 否则内容相对 clip 区平移 position-activeCorner，翻页页只剩页背景
    const style = buildFlippingPageStyle(frame, 1)
    expect(style.transform).toContain(
      `translate3d(${frame.pageRect.topLeft.x.toFixed(2)}px, ${frame.pageRect.topLeft.y.toFixed(2)}px, 0)`
    )
  })

  it('底层显露 / 已放平区 clip：landed 为折痕书脊侧半平面', () => {
    const bottom = buildBottomPageClipPath(frame)
    expect(bottom === null || bottom.startsWith('polygon(')).toBe(true)
    const landed = buildLandedPageClipPath(frame, W, H)!
    expect(landed.startsWith('polygon(')).toBe(true)
    expect(landed).not.toContain('evenodd')
    // 无折痕 → 整页放平
    expect(buildLandedPageClipPath({ ...frame, shadowStart: null }, W, H)).toContain(
      `${W.toFixed(2)}px`
    )
  })

  it('已放平区过中线仍为合法多边形（无三角漏片）', () => {
    const calc = new CurlCalculation(1, 'bottom', W, H)
    // 扫过中线两侧的折角点
    for (const x of [40, 120, 180, 240, 300]) {
      const f = calcCurlFrame(calc, { x, y: H - 40 })
      if (!f?.shadowStart) continue
      const landed = buildLandedPageClipPath(f, W, H)!
      const verts = landed.match(/-?\d+\.\d+px -?\d+\.\d+px/g) ?? []
      expect(verts.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('双阴影样式：宽度随 progress、不透明度按系数减淡、含 transform-origin 与 clip', () => {
    const outer = buildOuterShadowStyle(frame, 1, W, H)!
    expect(outer.width).toBeCloseTo(W * 0.75 * frame.progress, 3)
    expect(outer.height).toBe(H * 2)
    expect(outer.transformOrigin).toBe('0.00px 100px') // next: shadowTranslate=0
    // 外阴影减淡：opacity = (1-progress) × 0.45
    expect(outer.background).toContain(`rgba(0, 0, 0, ${((1 - frame.progress) * 0.45).toFixed(3)})`)
    expect(outer.clipPath.startsWith('polygon(')).toBe(true)

    const inner = buildInnerShadowStyle(frame, 1, W, H)!
    expect(inner.width).toBeCloseTo((W * 0.75 * frame.progress * 3) / 4, 3)
    expect(inner.transformOrigin).toBe(`${inner.width.toFixed(2)}px 100px`) // next inner: shadowTranslate=width
    expect(inner.background).toContain('to left')
  })

  it('折痕淡阴影（平铺页一侧）：宽度=外阴影一半、低不透明度、同折痕锚点', () => {
    const crease = buildCreaseShadowStyle(frame, 1, W, H)!
    expect(crease.width).toBeCloseTo((W * 0.75 * frame.progress) / 2, 3)
    expect(crease.background).toContain(
      `rgba(0, 0, 0, ${((1 - frame.progress) * 0.16).toFixed(3)})`
    )
    expect(crease.clipPath.startsWith('polygon(')).toBe(true)
    const outer = buildOuterShadowStyle(frame, 1, W, H)!
    expect(crease.transformOrigin).not.toBe(outer.transformOrigin) // 位于外阴影对侧
    // next：折痕淡阴影在平铺页侧（translate=width，渐变向左淡出）
    expect(crease.transformOrigin).toBe(`${crease.width.toFixed(2)}px 100px`)
    expect(crease.background).toContain('to left')
  })

  it('shadowStart 为 null 时阴影样式返回 null', () => {
    const empty = { ...frame, shadowStart: null }
    expect(buildOuterShadowStyle(empty, 1, W, H)).toBeNull()
    expect(buildInnerShadowStyle(empty, 1, W, H)).toBeNull()
    expect(buildCreaseShadowStyle(empty, 1, W, H)).toBeNull()
  })
})

describe('翻页页背面（整元素折痕反射，viewport 同构）', () => {
  const calc = new CurlCalculation(1, 'bottom', W, H)
  const frame = calcCurlFrame(calc, { x: 180, y: 350 })!

  const parseMatrix = (transform: string): number[] =>
    transform.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number)
  const parsePolygon = (clipPath: string): { x: number; y: number }[] =>
    clipPath.match(/-?\d+\.\d+px -?\d+\.\d+px/g)!.map((s) => {
      const [x, y] = s.replace(/px/g, '').split(' ').map(Number)
      return { x, y }
    })

  it('matrix 为反射（det=-1）且 clip 点落回原页坐标 T(F(p))≡p', () => {
    const style = buildFlippingBackFaceStyle(frame, 1)!
    const [a, b, c, d, e, f] = parseMatrix(style.transform)
    expect(a * d - b * c).toBeCloseTo(-1, 5)
    const pts = parsePolygon(style.clipPath)
    const src = frame.flippingClip.filter((p): p is { x: number; y: number } => p !== null)
    expect(pts.length).toBe(src.length)
    pts.forEach((q, i) => {
      expect(a * q.x + c * q.y + e).toBeCloseTo(src[i].x, 0)
      expect(b * q.x + d * q.y + f).toBeCloseTo(src[i].y, 0)
    })
  })

  it('折痕上的点是不动点：F(shadowStart)=shadowStart', () => {
    const style = buildFlippingBackFaceStyle(frame, 1)!
    const [a, b, c, d, e, f] = parseMatrix(style.transform)
    const s = frame.shadowStart!
    // F(s) = s → s 作为局部点经 T 也回到 s（T(F(s))=s 且 F(s)=s ⟹ T(s)=s）
    expect(a * s.x + c * s.y + e).toBeCloseTo(s.x, 0)
    expect(b * s.x + d * s.y + f).toBeCloseTo(s.y, 0)
  })

  it('shadowStart 为 null（退化帧）返回 null', () => {
    expect(buildFlippingBackFaceStyle({ ...frame, shadowStart: null }, 1)).toBeNull()
  })
})

describe('fold-point 帮助函数', () => {
  it('resolveCurlCorner：上半屏 top，下半屏 bottom', () => {
    expect(resolveCurlCorner(100, H)).toBe('top')
    expect(resolveCurlCorner(400, H)).toBe('bottom')
    expect(resolveCurlCorner(350, H)).toBe('bottom')
  })

  it('toCurlPagePoint：viewport 同构恒等', () => {
    expect(toCurlPagePoint({ x: 120, y: 300 }, 1)).toEqual({ x: 120, y: 300 })
    expect(toCurlPagePoint({ x: 120, y: 300 }, -1)).toEqual({ x: 120, y: 300 })
  })

  it('clampCurlDragPoint：x 夹在 ±(W-1)', () => {
    expect(clampCurlDragPoint({ x: 400, y: 100 }, 1, W).x).toBe(W - 1)
    expect(clampCurlDragPoint({ x: 200, y: 100 }, 1, W).x).toBe(200)
    expect(clampCurlDragPoint({ x: -400, y: 100 }, -1, W).x).toBe(-(W - 1))
    expect(clampCurlDragPoint({ x: -200, y: 100 }, -1, W).x).toBe(-200)
  })

  it('rest/commit 点：两方向统一（页坐标）', () => {
    expect(getCurlRestPoint('bottom', W, H)).toEqual({ x: W, y: H })
    expect(getCurlRestPoint('top', W, H)).toEqual({ x: W, y: 0 })
    expect(getCurlCommitPoint('bottom', W, H)).toEqual({ x: -W, y: H })
    expect(getCurlCommitPoint('top', W, H)).toEqual({ x: -W, y: 0 })
  })

  it('getDampedCurlPoint：progress 封顶 15%，viewport 同构', () => {
    const p1 = getDampedCurlPoint(1, 'bottom', -1000, 500, W, H)
    expect(p1.x).toBeCloseTo(W - 0.15 * 2 * W, 5)
    expect(p1.y).toBe(500)
    expect(getDampedCurlPoint(1, 'bottom', -30, 500, W, H).x).toBe(W - 30)
    // prev 书首：从 -W 探入，封顶 -W+0.3W
    const p3 = getDampedCurlPoint(-1, 'bottom', 1000, 500, W, H)
    expect(p3.x).toBeCloseTo(-W + 0.15 * 2 * W, 5)
    expect(getDampedCurlPoint(-1, 'bottom', 30, 500, W, H).x).toBe(-W + 30)
  })

  it('getCurlClickStartPoint：next 右缘内侧 / prev 左缘探入', () => {
    expect(getCurlClickStartPoint(1, 'bottom', W, H)).toEqual({ x: W - H / 10, y: H - H / 10 })
    expect(getCurlClickStartPoint(-1, 'top', W, H)).toEqual({ x: -W + H / 10, y: H / 10 })
  })

  it('projectVelocityToPath：viewport 同构投影', () => {
    const from = { x: W, y: H }
    const to = { x: -W, y: H }
    expect(projectVelocityToPath(-500, 1, from, to)).toBeGreaterThan(0)
    expect(projectVelocityToPath(500, 1, from, to)).toBeLessThan(0)
    // prev 放平：from=-W → to=+W，向右速度为正 t
    expect(projectVelocityToPath(500, -1, { x: -W, y: H }, { x: W, y: H })).toBeGreaterThan(0)
    expect(projectVelocityToPath(500, 1, from, from)).toBe(0)
  })

  it('lerpCurlPoint', () => {
    expect(lerpCurlPoint({ x: 0, y: 0 }, { x: 100, y: 200 }, 0.5)).toEqual({ x: 50, y: 100 })
    expect(lerpCurlPoint({ x: 0, y: 0 }, { x: 100, y: 200 }, 0)).toEqual({ x: 0, y: 0 })
    expect(lerpCurlPoint({ x: 0, y: 0 }, { x: 100, y: 200 }, 1)).toEqual({ x: 100, y: 200 })
  })
})
