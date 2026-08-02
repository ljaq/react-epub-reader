import { describe, it, expect } from 'vitest'
import { extractTtsSegments, processTTSContent, formatTtsMilliseconds, TTS_CONSTANT } from '../tts'
import { generateUUID } from '../tts/uuid'
import { getTTSAudioInfo, isAudioError, isAudioLoaded, isAudioPending, base64toBlob } from '../tts/audio-api'
import { judgeTtsInView, computeChapterPlayTime } from '../tts/position'
import { buildTextNodeInView, getReadDomPositionFromSnapshot } from '../tts/scroll'
import { createTtsState, createTtsMutations, syncTtsStateFromEngine, MOCK_VOICES } from '../tts/state'

describe('tts 文本切段', () => {
  it('extractTtsSegments 切出文本段', () => {
    const html = '<p>第一章正文内容片段</p><p>第二段内容继续</p>'
    const segs = extractTtsSegments(html)
    expect(Array.isArray(segs)).toBe(true)
    expect(segs.length).toBeGreaterThan(0)
    expect(segs.join('')).toContain('正文')
  })

  it('extractTtsSegments 无正文回退提示', () => {
    expect(extractTtsSegments('')).toEqual(['暂无正文内容，请继续阅读。'])
  })

  it('processTTSContent 返回 textList + chapterTextInfo', () => {
    const r = processTTSContent('<p>测试文本</p>', 3)
    expect(r.chapterId).toBe(3)
    expect(Array.isArray(r.textList)).toBe(true)
    expect(r.chapterTextInfo.ttsChapterDuration).toBeGreaterThan(0)
    expect(r.chapterTextInfo.ttsChapterDurationStr).toMatch(/^\d+:\d{2}$/)
  })

  it('formatTtsMilliseconds', () => {
    expect(formatTtsMilliseconds(0)).toBe('0:00')
    expect(formatTtsMilliseconds(65000)).toBe('1:05')
    expect(formatTtsMilliseconds(3599000)).toBe('59:59')
  })

  it('TTS_CONSTANT 关键常量', () => {
    expect(TTS_CONSTANT.TTS_TEXT_TIME_DURATION).toBe(160)
    expect(TTS_CONSTANT.AUDIO_CACHES_NUMBER).toBe(5)
    expect(TTS_CONSTANT.SKIP_TIME_SECONDS).toBe(15)
    expect(TTS_CONSTANT.MAX_AUDIO_WAIT_ATTEMPTS).toBe(5)
    expect(TTS_CONSTANT.TTS_TIMBRE_CONFIG).toBe('BV102_streaming')
    expect(TTS_CONSTANT.TEXT_RANGE).toEqual([20, 60])
  })
})

describe('tts uuid', () => {
  it('generateUUID 格式', () => {
    expect(generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('tts audio-api', () => {
  it('isAudioLoaded / Pending / Error', () => {
    expect(isAudioLoaded({ httpStatus: 'done', uuid: 'x' })).toBe(true)
    expect(isAudioPending({ httpStatus: 'pending', uuid: 'x' })).toBe(true)
    expect(isAudioError({ httpStatus: 'error', uuid: 'x' })).toBe(true)
    expect(isAudioLoaded(null)).toBe(false)
  })

  it('base64toBlob 生成 Blob', () => {
    const blob = base64toBlob('dGVzdA==', 'text/plain')
    expect(blob).toBeInstanceOf(Blob)
  })

  it('getTTSAudioInfo 错误重试后返回 error', async () => {
    const fetcher = async () => null
    const r = await getTTSAudioInfo({
      bookId: 1,
      chapterId: 1,
      uuid: 'u',
      text: 'x',
      voiceType: 'v',
      retryCount: 1,
      fetchTtsAudioRaw: fetcher
    })
    expect(r).toBe('error')
  })

  it('getTTSAudioInfo 成功返回 audioUrl + words', async () => {
    const fetcher = async () => ({
      code: 0,
      body: {
        data: 'data:audio/mp3;base64,dGVzdA==',
        addition: { duration: 100, frontend: { words: [{ word: '测', start_time: 0, end_time: 1 }] } },
        reqid: 'r'
      }
    })
    const r = (await getTTSAudioInfo({
      bookId: 1,
      chapterId: 1,
      uuid: 'u',
      text: '测',
      voiceType: 'v',
      fetchTtsAudioRaw: fetcher
    })) as { audioUrl: string; words: unknown[] }
    expect(r.audioUrl).toContain('data:audio/mp3')
    expect(r.words.length).toBe(1)
  })
})

describe('tts position', () => {
  it('judgeTtsInView 章节不同返回 false', () => {
    expect(
      judgeTtsInView({
        chapterId: 1,
        readChapterId: 2,
        textNodeInView: [],
        ttsCurrentDomPos: '0=1=0=0#0',
        ttsCurrentWordIndex: 0
      })
    ).toBe(false)
  })

  it('judgeTtsInView 命中可见区间', () => {
    expect(
      judgeTtsInView({
        chapterId: 1,
        readChapterId: 1,
        textNodeInView: [{ pos: '0=1=0=0', startTextId: 0, endTextId: 5 }],
        ttsCurrentDomPos: '0=1=0=0',
        ttsCurrentWordIndex: 3
      })
    ).toBe(true)
    expect(
      judgeTtsInView({
        chapterId: 1,
        readChapterId: 1,
        textNodeInView: [{ pos: '0=1=0=0', startTextId: 0, endTextId: 5 }],
        ttsCurrentDomPos: '0=1=0=0',
        ttsCurrentWordIndex: 9
      })
    ).toBe(false)
  })

  it('computeChapterPlayTime 累加', () => {
    const textObj = {
      1: [
        { calcDuration: 160, text: 'a', uuid: 'a' } as never,
        { calcDuration: 320, text: 'b', uuid: 'b' } as never
      ]
    }
    expect(
      computeChapterPlayTime({ ttsTextObject: textObj, chapterId: 1, textObjIndex: 1, currentTime: 0.5, duration: 1 })
    ).toBe(160 + 160)
  })
})

describe('tts scroll', () => {
  it('getReadDomPositionFromSnapshot', () => {
    expect(getReadDomPositionFromSnapshot({ domPos: '0=1=0=0#5' })).toEqual({ domPos: '0=1=0=0', textIdx: 5 })
    expect(getReadDomPositionFromSnapshot({ domPos: '0=1=0=0#0', strIdx: 7 })).toEqual({ domPos: '0=1=0=0', textIdx: 7 })
    expect(getReadDomPositionFromSnapshot({})).toEqual({ domPos: '', textIdx: 0 })
  })

  it('buildTextNodeInView 无元素返回空', () => {
    expect(buildTextNodeInView({ bodyEl: null, viewportEl: null, horizontal: false })).toEqual([])
  })
})

describe('tts state', () => {
  it('MOCK_VOICES 仅参考结构（reader 不内置音色列表）', () => {
    expect(MOCK_VOICES.length).toBe(6)
    expect(MOCK_VOICES[0].voiceType).toBe('BV102_streaming')
  })

  it('createTtsState 初始态', () => {
    const s = createTtsState()
    expect(s.playing).toBe(false)
    expect(s.voiceType).toBe('BV102_streaming')
    expect(s.timeoutMode).toBe('off')
  })

  it('syncTtsStateFromEngine 同步字段', () => {
    const s = createTtsState()
    syncTtsStateFromEngine(s, { playing: true, chapterId: 3, textObjIndex: 2, currentTime: 5 })
    expect(s.playing).toBe(true)
    expect(s.chapterId).toBe(3)
    expect(s.textObjIndex).toBe(2)
    expect(s.segmentIndex).toBe(2)
    expect(s.currentTime).toBe(5)
  })

  it('createTtsMutations 定时模式', () => {
    const s = createTtsState()
    const m = createTtsMutations(s)
    m.setTtsTimeoutMode(10)
    expect(s.timeoutMode).toBe(10)
    expect(s.timeoutRemaining).toBe(600)
    m.clearTtsTimeout()
    expect(s.timeoutMode).toBe('off')
    // lecture → end
    m.setTtsTimeoutMode('lecture' as never)
    expect(s.timeoutMode).toBe('end')
  })
})
