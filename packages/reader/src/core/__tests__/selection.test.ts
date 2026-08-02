import { describe, it, expect } from 'vitest'
import {
  SELECTION_MODE_HORIZONTAL,
  SELECTION_MODE_VERTICAL,
  encodeDomPath,
  getDomsInView,
  isChineseDominant,
  normalizeBoundaries,
  highlightPosListToText,
  highlightPosListToPosInfo,
  buildInitialBoundaries,
  clientToBoundaryPoint,
  toScreenRects,
  getSelectionBoundingRect
} from '../selection'

describe('selection 选中双模式', () => {
  it('SELECTION_MODE_VERTICAL / HORIZONTAL 常量', () => {
    expect(SELECTION_MODE_VERTICAL).toBe('vertical')
    expect(SELECTION_MODE_HORIZONTAL).toBe('horizontal')
  })

  it('isChineseDominant 中文占比 >= 0.3', () => {
    expect(isChineseDominant('')).toBe(true)
    expect(isChineseDominant('中文测试')).toBe(true)
    expect(isChineseDominant('hello world')).toBe(false)
  })

  it('normalizeBoundaries 同行交换', () => {
    const r = normalizeBoundaries({ x: 100, y: 10 }, { x: 10, y: 10 }, 1, 20, 16)
    // curBoundary=1, b1.y(10) < b2.y(10)+20 → aligned, b1.x>b2.x → swap, needUp=true
    expect(r.needUp).toBe(true)
    expect(r.boundary1.x).toBe(10)
    expect(r.boundary2.x).toBe(100)
  })

  it('highlightPosListToText / ToPosInfo', () => {
    const list = [
      { left: 0, top: 0, right: 10, bottom: 20, h: 20, v: 'A'.charCodeAt(0), p: '0=1=0=0', i: 0 },
      { left: 10, top: 0, right: 20, bottom: 20, h: 20, v: 'B'.charCodeAt(0), p: '0=1=0=0', i: 1 }
    ]
    expect(highlightPosListToText(list)).toBe('AB')
    const { posInfo, domPosBase } = highlightPosListToPosInfo(list)
    expect(posInfo).toEqual({ '0=1=0=0#0': 65, '0=1=0=0#1': 66 })
    expect(domPosBase).toBe('0=1=0')
  })

  it('highlightPosListToText 空列表', () => {
    expect(highlightPosListToText(null)).toBe('')
    expect(highlightPosListToPosInfo(null).domPosBase).toBe('0=1=0=0')
  })

  it('clientToBoundaryPoint 竖滚加 pageY', () => {
    expect(clientToBoundaryPoint(10, 20, SELECTION_MODE_VERTICAL, 100)).toEqual({ x: 10, y: 120 })
    expect(clientToBoundaryPoint(10, 20, SELECTION_MODE_HORIZONTAL, 100)).toEqual({ x: 10, y: 20 })
  })

  it('toScreenRects 竖滚减 pageY', () => {
    const list = [{ left: 0, top: 100, right: 10, bottom: 120, h: 20, v: 65, p: '0', i: 0 }]
    const r = toScreenRects(list, SELECTION_MODE_VERTICAL, 30)
    expect(r[0].top).toBe(70)
    expect(r[0].bottom).toBe(90)
  })

  it('getSelectionBoundingRect', () => {
    const list = [
      { left: 0, top: 10, right: 10, bottom: 20, h: 10, v: 65, p: '0', i: 0 },
      { left: 5, top: 15, right: 20, bottom: 30, h: 15, v: 66, p: '0', i: 1 }
    ]
    const rect = getSelectionBoundingRect(list, SELECTION_MODE_VERTICAL, 0)!
    expect(rect.left).toBe(0)
    expect(rect.right).toBe(20)
    expect(rect.top).toBe(10)
    expect(rect.bottom).toBe(30)
    expect(getSelectionBoundingRect(null)).toBeNull()
  })

  it('encodeDomPath / getDomsInView 在 jsdom 下返回空/默认', () => {
    // jsdom 无真实布局，仅验证不抛错与默认行为
    expect(encodeDomPath(null, null)).toBe('0')
    expect(getDomsInView([], SELECTION_MODE_VERTICAL, null)).toEqual([])
    expect(getDomsInView(null, SELECTION_MODE_VERTICAL, null)).toEqual([])
  })

  it('buildInitialBoundaries 在 jsdom 下不抛错', () => {
    const el = document.createElement('p')
    document.body.appendChild(el)
    const r = buildInitialBoundaries(el, SELECTION_MODE_VERTICAL, 0)
    expect(r.boundary1).toBeDefined()
    expect(r.boundary2).toBeDefined()
  })
})
