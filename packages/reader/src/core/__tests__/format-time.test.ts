import { describe, it, expect } from 'vitest'
import { formatSecondToTime } from '../format-time'

describe('format-time', () => {
  it('非有限数 / 负数 → 0:00', () => {
    expect(formatSecondToTime(NaN)).toBe('0:00')
    expect(formatSecondToTime(-5)).toBe('0:00')
    expect(formatSecondToTime(Infinity)).toBe('0:00')
  })
  it('正常格式化', () => {
    expect(formatSecondToTime(0)).toBe('0:00')
    expect(formatSecondToTime(5)).toBe('0:05')
    expect(formatSecondToTime(65)).toBe('1:05')
    expect(formatSecondToTime(3599)).toBe('59:59')
  })
})
