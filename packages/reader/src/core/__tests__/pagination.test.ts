import { describe, it, expect } from 'vitest'
import {
  applyDragResistance,
  applyGlobalDragResistance,
  calculatePagination,
  clampPageIndex,
  getContentExtentWidth,
  getPageStride,
  getTrackTranslateX,
  normalizeScrollWidth,
  PAGE_COLUMN_GAP,
  resolveDragTurn,
  resolveGlobalDragTurn
} from '../pagination'

describe('pagination', () => {
  it('PAGE_COLUMN_GAP = 40（与 Vue 逐字对照）', () => {
    expect(PAGE_COLUMN_GAP).toBe(40)
  })

  it('getPageStride = pageWidth + gap', () => {
    expect(getPageStride(398)).toBe(438)
    expect(getPageStride(398, 40)).toBe(438)
    expect(getPageStride(100, 20)).toBe(120)
  })

  it('clampPageIndex 边界', () => {
    expect(clampPageIndex(-1, 5)).toBe(0)
    expect(clampPageIndex(NaN, 5)).toBe(0)
    expect(clampPageIndex(0, 5)).toBe(0)
    expect(clampPageIndex(4, 5)).toBe(4)
    expect(clampPageIndex(5, 5)).toBe(4)
    expect(clampPageIndex(10, 5)).toBe(4)
    expect(clampPageIndex(2, 1)).toBe(0)
  })

  it('normalizeScrollWidth 去尾部余量（阈值 4）', () => {
    // stride=438, gap=40: (effectiveWidth + 40) % 438
    // effectiveWidth=876 → (876+40)%438 = 916%438 = 40 → >4 不裁
    expect(normalizeScrollWidth(876, 438, 40)).toBe(876)
    // effectiveWidth=872 → (872+40)%438 = 912%438 = 36 → >4 不裁
    expect(normalizeScrollWidth(872, 438, 40)).toBe(872)
    // effectiveWidth=438 → (438+40)%438 = 40 → >4 不裁
    expect(normalizeScrollWidth(438, 438, 40)).toBe(438)
    // effectiveWidth=434 → (434+40)%438 = 474%438 = 36 → >4
    expect(normalizeScrollWidth(434, 438, 40)).toBe(434)
    // 余量 <= 4 裁剪：effectiveWidth=876+4=880? 构造余量=2: need (w+40)%438<=4 → w+40 ≡ 0..4 mod 438 → w ≡ -40..-36 ≡ 398..402 mod 438
    // w=400 → (400+40)%438 = 440%438 = 2 → <=4 裁 → 400-2=398
    expect(normalizeScrollWidth(400, 438, 40)).toBe(398)
    expect(normalizeScrollWidth(0, 438, 40)).toBe(0)
  })

  it('getTrackTranslateX', () => {
    expect(getTrackTranslateX(0, 438, 0)).toBe(0)
    expect(getTrackTranslateX(1, 438, 0)).toBe(-438)
    expect(getTrackTranslateX(2, 438, 10)).toBe(-866)
    expect(getTrackTranslateX(1, 0, 5)).toBe(5)
  })

  it('applyGlobalDragResistance 边界阻尼', () => {
    // 首页右拉 0.2
    expect(applyGlobalDragResistance(100, 0, 5, false)).toBe(20)
    expect(applyGlobalDragResistance(100, 0, 5, true)).toBe(35)
    // 末页左拉
    expect(applyGlobalDragResistance(-100, 4, 5, false)).toBe(-20)
    expect(applyGlobalDragResistance(-100, 4, 5, true)).toBe(-35)
    // 中间页不阻尼
    expect(applyGlobalDragResistance(100, 2, 5, false)).toBe(100)
  })

  it('applyDragResistance 转发 applyGlobalDragResistance', () => {
    expect(applyDragResistance(100, 0, 5, false)).toBe(20)
    expect(applyDragResistance(100, 2, 5, false)).toBe(100)
  })

  it('resolveGlobalDragTurn 翻页判定', () => {
    expect(resolveGlobalDragTurn(2, 5, -50, 40)).toBe('next-page')
    expect(resolveGlobalDragTurn(2, 5, 50, 40)).toBe('prev-page')
    expect(resolveGlobalDragTurn(2, 5, 10, 40)).toBe('stay')
    expect(resolveGlobalDragTurn(4, 5, -50, 40)).toBe('stay')
    expect(resolveGlobalDragTurn(0, 5, 50, 40)).toBe('stay')
  })

  it('resolveDragTurn 转发', () => {
    expect(resolveDragTurn(2, 5, -50)).toBe('next-page')
    expect(resolveDragTurn(2, 5, 50)).toBe('prev-page')
  })

  it('calculatePagination 无效输入回退单页', () => {
    expect(calculatePagination(null, 398)).toEqual({
      pageCount: 1,
      pageWidth: 398,
      pageGap: 40,
      pageStride: 438
    })
    expect(calculatePagination(null, 0).pageCount).toBe(1)
  })

  it('getContentExtentWidth 无元素回退', () => {
    expect(getContentExtentWidth(null, 398)).toBe(398)
  })
})
