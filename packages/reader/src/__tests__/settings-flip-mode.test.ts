/**
 * flipMode 设置迁移单测（phase-10）。
 *
 * 覆盖：
 * - resolveFlipMode：显式合法值优先；旧 persist（无 flipMode 或非法值）一律回落
 *   默认 cover——开发阶段不做老用户习惯迁移（不按 horizontalEnabled 推导）
 * - normalizeSettings：flipMode 与 horizontalEnabled 派生同步
 * - DEFAULT_SETTINGS：新装默认 cover
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SETTINGS,
  deriveHorizontalEnabled,
  FLIP_MODES,
  isFlipMode,
  normalizeSettings,
  resolveFlipMode
} from '../store/settings-store'

describe('resolveFlipMode 旧数据迁移', () => {
  it('旧 persist 无 flipMode（无论 horizontalEnabled）→ 默认 cover（不迁移老习惯）', () => {
    expect(resolveFlipMode({ horizontalEnabled: true })).toBe('cover')
    expect(resolveFlipMode({ horizontalEnabled: false })).toBe('cover')
    expect(resolveFlipMode({})).toBe('cover')
  })

  it('显式 flipMode 优先（四档均合法，含 slide/vertical）', () => {
    expect(resolveFlipMode({ flipMode: 'cover', horizontalEnabled: true })).toBe('cover')
    expect(resolveFlipMode({ flipMode: 'vertical', horizontalEnabled: true })).toBe('vertical')
    expect(resolveFlipMode({ flipMode: 'slide', horizontalEnabled: false })).toBe('slide')
  })

  it('非法 flipMode 按缺失处理 → cover', () => {
    expect(resolveFlipMode({ flipMode: 'curl' as never, horizontalEnabled: true })).toBe('cover')
    expect(resolveFlipMode({ flipMode: 42 as never, horizontalEnabled: false })).toBe('cover')
  })
})

describe('normalizeSettings flipMode 派生', () => {
  it('flipMode 显式值保留，horizontalEnabled 派生同步', () => {
    const cover = normalizeSettings({ flipMode: 'cover' })
    expect(cover.flipMode).toBe('cover')
    expect(cover.horizontalEnabled).toBe(true)

    const vertical = normalizeSettings({ flipMode: 'vertical' })
    expect(vertical.flipMode).toBe('vertical')
    expect(vertical.horizontalEnabled).toBe(false)

    const slide = normalizeSettings({ flipMode: 'slide' })
    expect(slide.flipMode).toBe('slide')
    expect(slide.horizontalEnabled).toBe(true)
  })

  it('horizontalEnabled 与 flipMode 冲突时以 flipMode 为准', () => {
    const r = normalizeSettings({ flipMode: 'vertical', horizontalEnabled: true })
    expect(r.flipMode).toBe('vertical')
    expect(r.horizontalEnabled).toBe(false)
  })

  it('旧数据整体迁移：字段补全 + flipMode 回落默认 cover', () => {
    // 模拟旧版 persist 数据（无 flipMode 字段）
    const legacy = {
      theme: 'dark',
      brightness: 80,
      spacing: 'tight',
      fontSize: 20,
      fontWeight: 'normal',
      horizontalEnabled: true,
      eyeCareMode: false
    } as const
    const r = normalizeSettings(legacy)
    expect(r.flipMode).toBe('cover')
    expect(r.horizontalEnabled).toBe(true)
    expect(r.theme).toBe('dark')
    expect(r.fontSize).toBe(20)
  })

  it('simulation 合法（预留占位），派生 horizontalEnabled=true', () => {
    const r = normalizeSettings({ flipMode: 'simulation' })
    expect(r.flipMode).toBe('simulation')
    expect(r.horizontalEnabled).toBe(true)
  })
})

describe('flipMode 常量与工具', () => {
  it('FLIP_MODES 四枚枚举', () => {
    expect(FLIP_MODES).toEqual(['cover', 'slide', 'vertical', 'simulation'])
  })

  it('isFlipMode 校验', () => {
    expect(isFlipMode('cover')).toBe(true)
    expect(isFlipMode('simulation')).toBe(true)
    expect(isFlipMode('page')).toBe(false)
    expect(isFlipMode(undefined)).toBe(false)
  })

  it('deriveHorizontalEnabled：非竖滚即横排', () => {
    expect(deriveHorizontalEnabled('cover')).toBe(true)
    expect(deriveHorizontalEnabled('slide')).toBe(true)
    expect(deriveHorizontalEnabled('simulation')).toBe(true)
    expect(deriveHorizontalEnabled('vertical')).toBe(false)
  })

  it('DEFAULT_SETTINGS 新装默认 cover', () => {
    expect(DEFAULT_SETTINGS.flipMode).toBe('cover')
    expect(DEFAULT_SETTINGS.horizontalEnabled).toBe(true)
  })
})
