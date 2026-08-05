/**
 * core/motion 弹簧积分器单测（phase-11）。
 *
 * 覆盖：
 * - 收敛：向目标收敛、onComplete 恰好一次、终点恒等于 to
 * - 观感：默认参数落定时长 ≈280ms 量级、过冲 <2px（轻微或无过冲）
 * - 速度连续：非零初速度决定起步方向（先惯性滑行再被弹簧拉回）
 * - 取消：cancel 后不再 onUpdate/onComplete（幂等）
 * - 兜底：永不落定的参数（damping=0）由硬超时强制收尾
 */
import { describe, it, expect } from 'vitest'
import {
  createSpringAnimation,
  SPRING_MAX_DURATION_MS
} from '../motion'

/** 假时钟 + 手动 rAF：advance 以固定帧步进驱动动画 */
function createFakeClock() {
  let time = 0
  let nextId = 1
  let queue = new Map<number, () => void>()
  return {
    now: () => time,
    raf: (cb: () => void) => {
      const id = nextId++
      queue.set(id, cb)
      return id
    },
    cancelRaf: (id: number) => {
      queue.delete(id)
    },
    /** 推进 ms（按 16ms 帧切片触发挂起的 rAF 回调） */
    advance: (ms: number, frameMs = 16) => {
      const end = time + ms
      while (time < end) {
        time = Math.min(time + frameMs, end)
        const callbacks = [...queue.values()]
        queue.clear()
        callbacks.forEach((cb) => cb())
      }
    },
    pending: () => queue.size
  }
}

describe('createSpringAnimation 收敛与观感', () => {
  it('首帧同步回调 from；向 to 收敛后 onComplete 恰好一次，终点恒为 to', () => {
    const clock = createFakeClock()
    const updates: number[] = []
    let completes = 0
    createSpringAnimation({
      from: -120,
      to: -360,
      velocity: 0,
      now: clock.now,
      raf: clock.raf,
      cancelRaf: clock.cancelRaf,
      onUpdate: (x) => updates.push(x),
      onComplete: () => completes++
    })
    // 首帧同步回调起点
    expect(updates[0]).toBe(-120)

    clock.advance(2000)
    expect(completes).toBe(1)
    expect(updates[updates.length - 1]).toBe(-360)
    // 落定后无挂起帧
    expect(clock.pending()).toBe(0)
  })

  it('默认参数落定时长 ≈280ms 量级（100~500ms 之间）', () => {
    const clock = createFakeClock()
    let completeAt = -1
    let elapsed = 0
    createSpringAnimation({
      from: 0,
      to: 360,
      velocity: 0,
      now: clock.now,
      raf: clock.raf,
      cancelRaf: clock.cancelRaf,
      onUpdate: () => {},
      onComplete: () => {
        completeAt = elapsed
      }
    })
    while (completeAt < 0 && elapsed < 2000) {
      clock.advance(16)
      elapsed += 16
    }
    expect(completeAt).toBeGreaterThan(100)
    expect(completeAt).toBeLessThan(500)
  })

  it('过冲 < 2px（默认参数轻微或无过冲）', () => {
    const clock = createFakeClock()
    const updates: number[] = []
    createSpringAnimation({
      from: 0,
      to: 360,
      velocity: 0,
      now: clock.now,
      raf: clock.raf,
      cancelRaf: clock.cancelRaf,
      onUpdate: (x) => updates.push(x),
      onComplete: () => {}
    })
    clock.advance(2000)
    const overshoot = Math.max(...updates) - 360
    expect(overshoot).toBeLessThan(2)
  })

  it('速度连续：负初速度先惯性远离目标，再被弹簧拉回收敛', () => {
    const clock = createFakeClock()
    const updates: number[] = []
    let completes = 0
    createSpringAnimation({
      from: 0,
      to: 100,
      velocity: -3, // 3000px/s 反向（向左甩后松手，回滑距离 >20px 必然跨帧可见）
      now: clock.now,
      raf: clock.raf,
      cancelRaf: clock.cancelRaf,
      onUpdate: (x) => updates.push(x),
      onComplete: () => completes++
    })
    clock.advance(32) // 两帧：应先滑向负方向
    expect(Math.min(...updates)).toBeLessThan(0)

    clock.advance(2000)
    expect(completes).toBe(1)
    expect(updates[updates.length - 1]).toBe(100)
  })
})

describe('createSpringAnimation 取消与兜底', () => {
  it('cancel 后不再 onUpdate/onComplete；重复 cancel 安全', () => {
    const clock = createFakeClock()
    const updates: number[] = []
    let completes = 0
    const anim = createSpringAnimation({
      from: 0,
      to: 360,
      velocity: 0,
      now: clock.now,
      raf: clock.raf,
      cancelRaf: clock.cancelRaf,
      onUpdate: (x) => updates.push(x),
      onComplete: () => completes++
    })
    clock.advance(48)
    const countAtCancel = updates.length
    anim.cancel()
    anim.cancel()
    clock.advance(1000)
    expect(updates.length).toBe(countAtCancel)
    expect(completes).toBe(0)
    expect(clock.pending()).toBe(0)
  })

  it('硬超时兜底：damping=0（永不落定）超过 SPRING_MAX_DURATION_MS 强制收尾', () => {
    const clock = createFakeClock()
    const updates: number[] = []
    let completes = 0
    createSpringAnimation({
      from: 0,
      to: 360,
      velocity: 0,
      config: { damping: 0 },
      now: clock.now,
      raf: clock.raf,
      cancelRaf: clock.cancelRaf,
      onUpdate: (x) => updates.push(x),
      onComplete: () => completes++
    })
    clock.advance(SPRING_MAX_DURATION_MS + 100)
    expect(completes).toBe(1)
    expect(updates[updates.length - 1]).toBe(360)
    expect(clock.pending()).toBe(0)
  })
})
