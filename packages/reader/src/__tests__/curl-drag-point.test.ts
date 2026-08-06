/**
 * phase-14 仿真翻页 dragPoint slice 单测。
 *
 * 覆盖：
 * - setDragPoint 写入/清空语义（pointerdown 记起点 → move 更新 → 松手 null）；
 * - dragPoint 与 dragOffset 同级独立（互不联动），均可高频写入不进 React state；
 * - 订阅通知语义：新对象引用才触发（桥接 subscribe 比较依赖）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useReadingStore } from '../store/reading-store'

beforeEach(() => {
  useReadingStore.setState({ dragOffset: 0, dragPoint: null })
})

describe('reading-store dragPoint slice（phase-14）', () => {
  it('初始为 null；写入触点 → 读取一致；置 null 清空', () => {
    expect(useReadingStore.getState().dragPoint).toBeNull()
    useReadingStore.getState().setDragPoint({ x: 120, y: 300 })
    expect(useReadingStore.getState().dragPoint).toEqual({ x: 120, y: 300 })
    useReadingStore.getState().setDragPoint({ x: 90, y: 310 })
    expect(useReadingStore.getState().dragPoint).toEqual({ x: 90, y: 310 })
    useReadingStore.getState().setDragPoint(null)
    expect(useReadingStore.getState().dragPoint).toBeNull()
  })

  it('与 dragOffset 同级独立：互不联动', () => {
    useReadingStore.getState().setDragPoint({ x: 100, y: 200 })
    expect(useReadingStore.getState().dragOffset).toBe(0)
    useReadingStore.getState().setDragOffset(-50)
    expect(useReadingStore.getState().dragPoint).toEqual({ x: 100, y: 200 })
    useReadingStore.getState().setDragPoint(null)
    expect(useReadingStore.getState().dragOffset).toBe(-50)
  })

  it('subscribe：dragPoint 引用变化触发通知（桥接合帧依赖）', () => {
    let notified = 0
    const unsub = useReadingStore.subscribe((state, prev) => {
      if (state.dragPoint !== prev.dragPoint) notified += 1
    })
    useReadingStore.getState().setDragPoint({ x: 1, y: 2 })
    useReadingStore.getState().setDragPoint({ x: 3, y: 4 })
    useReadingStore.getState().setDragPoint(null)
    expect(notified).toBe(3)
    unsub()
  })
})
