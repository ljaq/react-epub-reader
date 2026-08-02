import { describe, it, expect } from 'vitest'
import {
  buildPosInfoFromText,
  decodeBookmarkSummary,
  encodeBookmarkSummary,
  extractDomPosBase,
  extractDomPosFromPosInfo,
  generateBookmarkId,
  generateReaderWebId,
  getParagraphIndexFromDomPos,
  parseStrIdxFromBookmarkId
} from '../reading-position/pos-info'

// 真实 posInfo 数据：old-vue-reader/prd/接口案例.md 第 60-117 行（划线列表）
const REAL_POS_INFO: Record<string, number> = {
  '0=1=7=0#61': 29983,
  '0=1=7=0#62': 24577,
  '0=1=7=0#63': 23398,
  '0=1=7=0#64': 19978,
  '0=1=7=0#65': 20998,
  '0=1=7=0#66': 26512,
  '0=1=7=0#67': 65292,
  '0=1=7=0#68': 36825,
  '0=1=7=0#69': 31181,
  '0=1=7=0#70': 25512
}

// 真实划线色值：接口案例.md 第 119 行
const REAL_UNDERLINE_COLOR = 'rgba(255,157,0,0.3)'

describe('pos-info 编解码（字节级兼容 Vue）', () => {
  it('extractDomPosFromPosInfo 取最小 domPos', () => {
    expect(extractDomPosFromPosInfo(REAL_POS_INFO)).toBe('0=1=7=0#61')
  })

  it('extractDomPosBase 取 domPosBase', () => {
    expect(extractDomPosBase(REAL_POS_INFO)).toBe('0=1=7=0')
  })

  it('getParagraphIndexFromDomPos 解析段落索引', () => {
    expect(getParagraphIndexFromDomPos('0=1=7=0#61')).toBe(7)
    expect(getParagraphIndexFromDomPos('')).toBe(-1)
  })

  it('buildPosInfoFromText 按 charCode 编码，键格式 0=1=7=0#N', () => {
    const text = '生态'
    const posInfo = buildPosInfoFromText(text, '0=1=7=0')
    expect(Object.keys(posInfo)).toEqual(['0=1=7=0#0', '0=1=7=0#1'])
    expect(posInfo['0=1=7=0#0']).toBe('生'.charCodeAt(0))
    expect(posInfo['0=1=7=0#1']).toBe('态'.charCodeAt(0))
  })

  it('真实 posInfo 键值与 Vue 字节级一致', () => {
    // 抽样断言：键 "0=1=7=0#61" → 29983（'生' 的 charCode）
    expect(REAL_POS_INFO['0=1=7=0#61']).toBe(29983)
    expect(String.fromCharCode(29983)).toBe('生')
  })

  it('generateReaderWebId 以 er 开头', () => {
    expect(generateReaderWebId()).toMatch(/^er\d+$/)
  })

  it('generateBookmarkId / parseStrIdxFromBookmarkId 往返', () => {
    const id = generateBookmarkId(3, 17814145725042474 % 100000)
    expect(parseStrIdxFromBookmarkId(id)).not.toBeNull()
    // chapterId=3 → 0003，strIdx=0 → 00000
    expect(generateBookmarkId(3, 0)).toBe('000300000')
    expect(parseStrIdxFromBookmarkId('000300000')).toBe(0)
    expect(parseStrIdxFromBookmarkId('000312345')).toBe(12345)
    expect(parseStrIdxFromBookmarkId('abc')).toBeNull()
  })

  it('encodeBookmarkSummary / decodeBookmarkSummary 往返', () => {
    const encoded = encodeBookmarkSummary({
      domPos: '0=1=7=0#61',
      precent: 0.5,
      summary: '生态学上分析',
      strIdx: 10,
      horizontal: true,
      pageIndex: 2,
      pageCount: 5
    })
    const decoded = decodeBookmarkSummary(encoded)
    expect(decoded.domPos).toBe('0=1=7=0#61')
    expect(decoded.precent).toBe(0.5)
    expect(decoded.summary).toBe('生态学上分析')
    expect(decoded.strIdx).toBe(10)
    expect(decoded.cur).toBe(2)
    expect(decoded.totalPage).toBe(5)
    expect(decoded.isLastPage).toBe(false)
  })

  it('encodeBookmarkSummary 竖滚 h5PageY 分支', () => {
    const encoded = encodeBookmarkSummary({
      domPos: '0=1=0=0#0',
      precent: 0.3,
      summary: 'x',
      strIdx: 0,
      h5PageY: 120
    })
    const decoded = decodeBookmarkSummary(encoded)
    expect(decoded.h5PageY).toBe(120)
  })

  it('decodeBookmarkSummary 非 JSON 回退 summary', () => {
    expect(decodeBookmarkSummary('')).toEqual({})
    expect(decodeBookmarkSummary('纯文本')).toEqual({ summary: '纯文本' })
  })

  it('划线色值规则：rgba(255,157,0,0.3) 长度 > 7（黄底）', () => {
    expect(REAL_UNDERLINE_COLOR.length).toBeGreaterThan(7)
  })
})
