/**
 * raf-batcher 合帧器单测（phase-11）。
 *
 * 覆盖：
 * - 同帧多次 schedule 只执行最后一次 task（合帧）
 * - 帧回调后复位，可再次 schedule
 * - task 内嵌套 schedule 排到下一帧（不在同帧递归）
 * - cancel 阻止执行；重复/空 cancel 安全
 */
import { describe, it, expect } from 'vitest'
import { createRafBatcher } from '../raf-batcher'

function createFakeRaf() {
  let nextId = 1
  let queue = new Map<number, () => void>()
  return {
    raf: (cb: () => void) => {
      const id = nextId++
      queue.set(id, cb)
      return id
    },
    cancelRaf: (id: number) => {
      queue.delete(id)
    },
    /** 触发一帧：执行当前挂起的全部回调（回调内注册的进下一帧） */
    flushFrame: () => {
      const callbacks = [...queue.values()]
      queue.clear()
      callbacks.forEach((cb) => cb())
    },
    pending: () => queue.size
  }
}

describe('createRafBatcher', () => {
  it('同帧多次 schedule 只执行最后一次 task，且只执行一次', () => {
    const fake = createFakeRaf()
    const batcher = createRafBatcher(fake.raf, fake.cancelRaf)
    const ran: string[] = []
    batcher.schedule(() => ran.push('a'))
    batcher.schedule(() => ran.push('b'))
    batcher.schedule(() => ran.push('c'))
    expect(fake.pending()).toBe(1)

    fake.flushFrame()
    expect(ran).toEqual(['c'])
  })

  it('帧回调后复位，下一帧可再次 schedule', () => {
    const fake = createFakeRaf()
    const batcher = createRafBatcher(fake.raf, fake.cancelRaf)
    const ran: string[] = []
    batcher.schedule(() => ran.push('f1'))
    fake.flushFrame()
    batcher.schedule(() => ran.push('f2'))
    fake.flushFrame()
    expect(ran).toEqual(['f1', 'f2'])
  })

  it('task 内嵌套 schedule 排到下一帧执行', () => {
    const fake = createFakeRaf()
    const batcher = createRafBatcher(fake.raf, fake.cancelRaf)
    const ran: string[] = []
    batcher.schedule(() => {
      ran.push('outer')
      batcher.schedule(() => ran.push('inner'))
    })
    fake.flushFrame()
    expect(ran).toEqual(['outer'])
    fake.flushFrame()
    expect(ran).toEqual(['outer', 'inner'])
  })

  it('cancel 阻止执行；重复与空 cancel 安全', () => {
    const fake = createFakeRaf()
    const batcher = createRafBatcher(fake.raf, fake.cancelRaf)
    const ran: string[] = []
    batcher.cancel() // 空 cancel
    batcher.schedule(() => ran.push('x'))
    batcher.cancel()
    batcher.cancel() // 重复 cancel
    fake.flushFrame()
    expect(ran).toEqual([])
    expect(fake.pending()).toBe(0)

    // cancel 后仍可重新 schedule
    batcher.schedule(() => ran.push('y'))
    fake.flushFrame()
    expect(ran).toEqual(['y'])
  })
})
