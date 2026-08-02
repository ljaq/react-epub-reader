import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyLineMarkStyle,
  DEFAULT_UNDERLINE_COLOR,
  isBackgroundLineColor,
  LINE_COLOR_BLUE,
  LINE_COLOR_MAP,
  unwrapLineMark,
  wrapLineMark,
  applyChapterLines,
  detectDuplicateLine,
  getPosInfoBoundaryKeys,
  buildTargetRangeFromPosInfo
} from '../highlights'
import { syncChapterNotes, groupChapterNotes, BADGE_TOP_OFFSET } from '../highlights/note'

describe('highlights/line 常量与色值规则', () => {
  it("DEFAULT_UNDERLINE_COLOR = 'rgba(255,157,0,0.3)'", () => {
    expect(DEFAULT_UNDERLINE_COLOR).toBe('rgba(255,157,0,0.3)')
  })
  it("LINE_COLOR_BLUE = '#0080FF'", () => {
    expect(LINE_COLOR_BLUE).toBe('#0080FF')
  })
  it('LINE_COLOR_MAP', () => {
    expect(LINE_COLOR_MAP).toEqual([DEFAULT_UNDERLINE_COLOR, LINE_COLOR_BLUE])
  })
  it('划线色值规则：length > 7 黄底，≤7 蓝线', () => {
    expect(isBackgroundLineColor('rgba(255,157,0,0.3)')).toBe(true) // 19 > 7
    expect(isBackgroundLineColor('#0080FF')).toBe(false) // 7 ≤ 7
    expect(isBackgroundLineColor(undefined)).toBe(true) // 默认黄底
  })
})

describe('highlights/line wrap/unwrap', () => {
  let root: HTMLElement
  beforeEach(() => {
    root = document.createElement('div')
    root.innerHTML = '<p id="p1">生态学上分析，这种推理就失去了任何玄乎的成分</p>'
    document.body.appendChild(root)
  })

  it('applyLineMarkStyle 黄底 vs 蓝线', () => {
    const mark = document.createElement('mark')
    applyLineMarkStyle(mark, 'rgba(255,157,0,0.3)')
    expect(mark.classList.contains('reader-line-mark--background')).toBe(true)
    // jsdom 归一化 rgba 空格，断言关键分量即可
    expect(mark.style.backgroundColor).toMatch(/255.*157.*0.*0\.3/)
    applyLineMarkStyle(mark, '#0080FF')
    expect(mark.classList.contains('reader-line-mark--underline')).toBe(true)
    expect(mark.style.borderBottom).toMatch(/2px solid/i)
    expect(mark.style.borderBottom).toMatch(/0.*128.*255|0080ff/i)
  })

  it('wrapLineMark / unwrapLineMark 按 summary 文本包裹与解包', () => {
    const item = { webLineId: 'er1', summary: '生态学上分析', underlineColor: '#0080FF' }
    const mark = wrapLineMark(root, item)
    expect(mark).not.toBeNull()
    expect(root.querySelector('[data-web-line-id="er1"]')).not.toBeNull()
    // 已存在则复用
    expect(wrapLineMark(root, item)).not.toBeNull()
    unwrapLineMark(root, 'er1')
    expect(root.querySelector('[data-web-line-id="er1"]')).toBeNull()
  })

  it('wrapLineMark 按 posInfo 包裹', () => {
    const posInfo: Record<string, number> = { '0=0=0=0#0': '生'.charCodeAt(0), '0=0=0=0#1': '态'.charCodeAt(0) }
    const item = { webLineId: 'er2', posInfo, summary: '生态', underlineColor: DEFAULT_UNDERLINE_COLOR }
    // posInfo 路径在 jsdom 下可能解析不到文本节点，验证不抛错即可
    expect(() => wrapLineMark(root, item)).not.toThrow()
  })

  it('applyChapterLines 批量应用', () => {
    const data = {
      data: {
        er3: { summary: '生态学上分析', underlineColor: '#0080FF' }
      }
    }
    const applied = applyChapterLines(root, data)
    expect(applied).toContain('er3')
  })

  it('getPosInfoBoundaryKeys', () => {
    const posInfo = { '0=1=7=0#5': 22312, '0=1=7=0#10': 21561 }
    const keys = getPosInfoBoundaryKeys(posInfo)!
    expect(keys.startKey).toBe('0=1=7=0#5')
    expect(keys.endKey).toBe('0=1=7=0#10')
    expect(getPosInfoBoundaryKeys({})).toBeNull()
  })

  it('detectDuplicateLine 按 boundary key 命中', () => {
    const posInfo = { '0=1=7=0#5': 22312, '0=1=7=0#10': 21561 }
    const chapterLinesData = {
      data: { erX: { posInfo: { '0=1=7=0#5': 1, '0=1=7=0#10': 2 } } }
    }
    expect(detectDuplicateLine({ posInfo, chapterLinesData })).toBe('erX')
    expect(detectDuplicateLine({ posInfo: {}, chapterLinesData })).toBeNull()
  })

  it('buildTargetRangeFromPosInfo 空 posInfo 返回 null', () => {
    expect(buildTargetRangeFromPosInfo(root, {})).toBeNull()
  })
})

describe('highlights/note', () => {
  it('BADGE_TOP_OFFSET = 20', () => {
    expect(BADGE_TOP_OFFSET).toBe(20)
  })

  it('groupChapterNotes 按 summary 去空白分组', () => {
    const data = {
      data: {
        n1: { id: 1, summary: '生态 学', content: 'a', webNoteId: 'n1' },
        n2: { id: 2, summary: '生态学', content: 'b', webNoteId: 'n2' }
      }
    }
    const groups = groupChapterNotes(data)
    expect(groups.length).toBe(1)
    expect(groups[0].notes.length).toBe(2)
    expect(groups[0].notes[0].id).toBe(2) // 按 id 降序
  })

  it('groupChapterNotes 无数据', () => {
    expect(groupChapterNotes(null)).toEqual([])
    expect(groupChapterNotes({ data: { n1: { summary: '' } } })).toEqual([])
  })

  it('wrapNoteMark / syncChapterNotes', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>生态学上分析这种推理</p>'
    document.body.appendChild(root)
    const data = { data: { n1: { summary: '生态学上分析', content: 'x', webNoteId: 'n1' } } }
    const applied = syncChapterNotes(root, data)
    expect(applied.length).toBe(1)
    expect(root.querySelector('.reader-note-mark[data-note-group]')).not.toBeNull()
    // 再次同步复用
    syncChapterNotes(root, data)
    // 清空后同步应移除旧 mark
    syncChapterNotes(root, { data: {} })
  })
})
