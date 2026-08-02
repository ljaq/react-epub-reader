/**
 * TTS 文本处理核心：切段、拼接、字符 DOM 映射。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-text-process.js:10-243
 */

import TTS_CONSTANT from './constant'

const { TTS_TEXT_SPLIT_TYPE, TEXT_RANGE, TTS_TEXT_TIME_DURATION } = TTS_CONSTANT

/** 毫秒 → "m:ss" 格式化（TTS 时长显示）。对齐 Vue tts-text-process.js:10 */
export function formatTtsMilliseconds(ms: number): string {
  const totalSeconds = Math.floor(Number(ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** 文本是否有效（去空白/标点/emoji 后非空）。用于过滤空 TTS 段。对齐 Vue tts-text-process.js:17 */
export function isValidText(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') {
    return false
  }
  const cleanText = text.replace(/[\s\p{P}\p{Z}\p{Emoji}]/gu, '')
  return cleanText.length > 0
}

/** 按句号/逗号/空格把长文本切成 [20,60] 字符的段（中文标点优先切，再按空格）。对齐 Vue tts-text-process.js:25 */
export function textSplit(text: string): string[] {
  const textLength = text.length
  const [min, max] = TEXT_RANGE

  if (textLength < min) {
    return [text]
  }

  if (textLength >= min && textLength <= max) {
    return [text]
  }

  const result: string[] = []
  let start = 0

  while (start < textLength) {
    let end = start + max

    if (end > textLength) {
      end = textLength
    } else {
      const chinesePunctuationRegex = /[，。！？；：…—]/
      const slice = text.slice(start, end)
      let lastMatchIndex = -1

      for (let i = slice.length - 1; i >= 0; i -= 1) {
        if (chinesePunctuationRegex.test(slice[i])) {
          lastMatchIndex = i
          break
        }
      }

      if (lastMatchIndex !== -1) {
        end = lastMatchIndex + start + 1
      } else {
        const lastSpaceIndex = text.lastIndexOf(' ', end)
        if (lastSpaceIndex !== -1 && lastSpaceIndex > start) {
          end = lastSpaceIndex
        }
      }
    }

    const slice = text.slice(start, end)
    if (slice.length < min) {
      result[result.length - 1] += slice
    } else {
      result.push(text.slice(start, end))
    }
    start = end
  }

  return result
}

export interface TtsTextItem {
  uuid: string
  text: string
  originText: string
  originTextLength: number
  originTextIndexStart: number
  originTextIndexEnd: number
  textLength: number
  textTotalLength: number
  textIndex: number
  tag: string
  node: Text
  textSpliteType: number
  textSpliteTypeText: string
  domPos: string
  appendText?: string[]
  appendTextUuid?: string[]
  appendTextRange?: [number, number][]
  appendTextDomPos?: string[]
  textTotalLength2?: number
  invalid?: boolean
  isLast?: boolean
  calcText?: string
  calcTextLength?: number
  calcDuration?: number
  charDomMap?: Record<string, CharDomEntry[]>
}

export interface CharDomEntry {
  word: string
  originIndex: number
  domPos: string
  uuid: string
  text: string
  textIndexStart: number
  textIndexEnd: number
  calcIndex?: number
}

function findAppendTextMapping(item: TtsTextItem, index: number): {
  domPos: string
  uuid: string
  text: string
  textIndexStart: number
  textIndexEnd: number
  charIndexInOriginText: number
} | null {
  let accumulatedLength = item.originTextLength

  for (let i = 0; i < (item.appendText || []).length; i += 1) {
    const appendTextLength = (item.appendText || [])[i].length

    if (index < accumulatedLength + appendTextLength) {
      const [start, end] = (item.appendTextRange || [])[i]
      return {
        domPos: (item.appendTextDomPos || [])[i],
        uuid: (item.appendTextUuid || [])[i],
        text: (item.appendText || [])[i],
        textIndexStart: start,
        textIndexEnd: end,
        charIndexInOriginText: index - accumulatedLength
      }
    }

    accumulatedLength += appendTextLength
  }

  return null
}

function linkCalcTextIndex(charDomMap: Record<string, CharDomEntry[]>, calcText: string): void {
  const calcWords: Record<string, { word: string; calcIndex: number }[]> = {}

  calcText.split('').forEach((char, index) => {
    if (!calcWords[char]) {
      calcWords[char] = []
    }
    calcWords[char].push({ word: char, calcIndex: index })
  })

  Object.keys(charDomMap).forEach(char => {
    const charList = charDomMap[char]
    for (let i = 0; i < charList.length; i += 1) {
      charList[i].calcIndex = calcWords[char]?.[i]?.calcIndex ?? -1
    }
  })
}

/** 构建字符→DOM 映射表（含 originIndex/domPos/uuid 与 calcIndex 用于对齐音频 word 时间）。对齐 Vue tts-text-process.js:121 */
export function buildCharDomMap(item: TtsTextItem): Record<string, CharDomEntry[]> {
  const charDomMap: Record<string, CharDomEntry[]> = {}
  const { UNSPLICED, SPLICED, SPLICED_BY_AFTER, SPLICED_SPLICED_BY_AFTER } = TTS_TEXT_SPLIT_TYPE

  const createOriginTextMapping = (index: number) => ({
    domPos: item.domPos,
    uuid: item.uuid,
    text: item.originText,
    textIndexStart: item.originTextIndexStart,
    textIndexEnd: item.originTextIndexEnd,
    charIndexInOriginText: index
  })

  item.text.split('').forEach((char, index) => {
    if (!charDomMap[char]) {
      charDomMap[char] = []
    }

    let mapping:
      | ReturnType<typeof createOriginTextMapping>
      | ReturnType<typeof findAppendTextMapping>
      | null = null

    switch (item.textSpliteType) {
      case UNSPLICED:
      case SPLICED:
        mapping = createOriginTextMapping(index)
        break
      case SPLICED_BY_AFTER:
      case SPLICED_SPLICED_BY_AFTER:
        if (index < item.originTextLength) {
          mapping = createOriginTextMapping(index)
        } else {
          mapping = findAppendTextMapping(item, index)
        }
        break
      default:
        break
    }

    if (mapping) {
      charDomMap[char].push({
        word: char,
        originIndex: mapping.charIndexInOriginText,
        domPos: mapping.domPos,
        uuid: mapping.uuid,
        text: mapping.text,
        textIndexStart: mapping.textIndexStart,
        textIndexEnd: mapping.textIndexEnd
      })
    }
  })

  linkCalcTextIndex(charDomMap, item.calcText || item.text)
  return charDomMap
}

/** 把过短段（<20）追加到前/后段，生成 SPLICED_BY_AFTER 等拆分类型标记。对齐 Vue tts-text-process.js:175 */
export function textJoin(textList: TtsTextItem[]): TtsTextItem[] {
  const result: TtsTextItem[] = []
  const [min] = TEXT_RANGE
  const { SPLICED, SPLICED_BY_AFTER, SPLICED_BY_AFTER_TEXT, SPLICED_SPLICED_BY_AFTER, SPLICED_SPLICED_BY_AFTER_TEXT } =
    TTS_TEXT_SPLIT_TYPE

  for (let i = 0; i < textList.length; i += 1) {
    const currentText = textList[i]

    if (currentText.textLength < min) {
      let prevIndex = i - 1
      while (prevIndex >= 0 && textList[prevIndex].invalid) {
        prevIndex -= 1
      }
      const prevText = prevIndex >= 0 ? textList[prevIndex] : null

      if (prevText) {
        prevText.text += currentText.text
        prevText.appendText = prevText.appendText || []
        prevText.appendText.push(currentText.text)
        prevText.appendTextUuid = prevText.appendTextUuid || []
        prevText.appendTextUuid.push(currentText.uuid)
        prevText.appendTextRange = prevText.appendTextRange || []
        prevText.appendTextRange.push([currentText.originTextIndexStart, currentText.originTextIndexEnd])
        prevText.appendTextDomPos = prevText.appendTextDomPos || []
        prevText.appendTextDomPos.push(currentText.domPos)
        prevText.textLength += currentText.textLength
        prevText.textTotalLength = (prevText.textTotalLength || 0) + currentText.textLength
        prevText.textSpliteType = ([SPLICED, SPLICED_SPLICED_BY_AFTER] as number[]).includes(prevText.textSpliteType)
          ? SPLICED_SPLICED_BY_AFTER
          : SPLICED_BY_AFTER
        prevText.textSpliteTypeText = ([SPLICED, SPLICED_SPLICED_BY_AFTER] as number[]).includes(prevText.textSpliteType)
          ? SPLICED_SPLICED_BY_AFTER_TEXT
          : SPLICED_BY_AFTER_TEXT
        currentText.invalid = true
        continue
      }

      const nextText = textList[i + 1]
      if (nextText) {
        currentText.text += nextText.text
        currentText.appendText = currentText.appendText || []
        currentText.appendText.push(nextText.text)
        currentText.appendTextUuid = currentText.appendTextUuid || []
        currentText.appendTextUuid.push(nextText.uuid)
        currentText.appendTextRange = currentText.appendTextRange || []
        currentText.appendTextRange.push([nextText.originTextIndexStart, nextText.originTextIndexEnd])
        currentText.appendTextDomPos = currentText.appendTextDomPos || []
        currentText.appendTextDomPos.push(nextText.domPos)
        currentText.textLength += nextText.textLength
        currentText.textTotalLength = (currentText.textTotalLength || 0) + nextText.textLength
        currentText.textSpliteType = ([SPLICED, SPLICED_SPLICED_BY_AFTER] as number[]).includes(currentText.textSpliteType)
          ? SPLICED_SPLICED_BY_AFTER
          : SPLICED_BY_AFTER
        currentText.textSpliteTypeText = ([SPLICED, SPLICED_SPLICED_BY_AFTER] as number[]).includes(
          currentText.textSpliteType
        )
          ? SPLICED_SPLICED_BY_AFTER_TEXT
          : SPLICED_BY_AFTER_TEXT
        result.push(currentText)
        nextText.invalid = true
        i += 1
        continue
      }
    }

    result.push(currentText)
  }

  return result
}

/** 由文本节点逐级 childNodes 索引算 domPos（停在 read_c/virtualDom/reader-content__body）。对齐 Vue tts-text-process.js:254 */
export function computeDomPosFromTextNode(textNode: Node): string {
  if (!textNode || (textNode as Text).nodeType !== Node.TEXT_NODE) {
    return ''
  }

  let domPos = ''
  let currentNode: Node | null = textNode

  while (!isDomPosStopNode(currentNode)) {
    const parentElement: HTMLElement | null = (currentNode as Element).parentElement
    if (!parentElement) {
      break
    }

    let found = false
    for (let i = 0; i < parentElement.childNodes.length; i += 1) {
      if (currentNode === parentElement.childNodes[i]) {
        domPos += `=${i}`
        found = true
        break
      }
    }

    if (!found) {
      break
    }

    currentNode = parentElement
  }

  return domPos.split('=').reverse().join('=').replace(/[=]$/, '')
}

function isDomPosStopNode(node: Node | null): boolean {
  return Boolean(
    node &&
      (node as Element).classList &&
      ((node as Element).classList.contains('read_c') ||
        (node as Element).classList.contains('virtualDom') ||
        (node as Element).classList.contains('reader-content__body'))
  )
}

/** 由 TTS 文本列表算章节总时长信息（totalLength/duration/格式化字符串）。对齐 Vue tts-text-process.js:345 */
export function buildChapterTextInfo(ttsTextList: TtsTextItem[]): {
  totalLength: number
  ttsChapterDuration: number
  ttsChapterDurationStr: string
} {
  const totalLength = ttsTextList.reduce((acc, cur) => acc + (cur.calcTextLength || 0), 0)
  return {
    totalLength,
    ttsChapterDuration: totalLength * TTS_TEXT_TIME_DURATION,
    ttsChapterDurationStr: formatTtsMilliseconds(totalLength * TTS_TEXT_TIME_DURATION)
  }
}
