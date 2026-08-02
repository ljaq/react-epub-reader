/**
 * TTS 播放位置解析（DOM 位置 ↔ 音频时间 ↔ 视口可见判定）。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-position.js:1-160
 */

import TTS_CONSTANT from './constant'
import { setTtsPlayPosition } from './storage'
import type { TtsTextItem } from './text-process-core'

export interface TtsAudioInfo {
  words?: { word: string; start_time: number; end_time: number; unit_type?: string }[]
  uuid: string
  chapterId: number
  textObj?: TtsTextItem
}

export interface SetReadDomPositionInput {
  audioPlayer: { currentTime: number; audioInfo?: TtsAudioInfo | null } & HTMLAudioElement
  ttsTextObject: Record<number, TtsTextItem[]>
  bookId?: number | string
  onUpdate?: (position: TtsReadPosition) => void
}

export interface TtsReadPosition {
  ttsChapterId: number
  ttsCurrentAudioIndex: number
  ttsCurrentWord: string
  ttsCurrentWordIndex: number
  ttsCurrentDomPos: string
  textObjIndex: number
}

/** 由音频 currentTime + words 时间戳反推 DOM 位置（domPos/wordIndex），并持久化播放位置。对齐 Vue tts-position.js:8 */
export function setReadDomPosition({ audioPlayer, ttsTextObject, bookId, onUpdate }: SetReadDomPositionInput): TtsReadPosition | null {
  try {
    const { currentTime, audioInfo } = audioPlayer
    if (!audioInfo) {
      return null
    }

    const { words, uuid, chapterId } = audioInfo
    if (!words || !words.length) {
      return null
    }

    let currentTTSWord: { word: string; start_time: number; end_time: number; unit_type?: string }
    let currentTTSWordIndex: number

    if (currentTime <= 0) {
      currentTTSWord = words[0]
      currentTTSWordIndex = 0
    } else {
      currentTTSWordIndex = words.findIndex(item => item.start_time <= currentTime && item.end_time >= currentTime)
      if (currentTTSWordIndex < 0) {
        return null
      }
      currentTTSWord = words[currentTTSWordIndex]
    }

    if (!currentTTSWord || currentTTSWord.unit_type === 'mark') {
      return null
    }

    let currentTTSWordTimes = -1
    for (let i = 0; i < words.length; i += 1) {
      const ttsWord = words[i]
      if (ttsWord.word === currentTTSWord.word) {
        currentTTSWordTimes += 1
        if (ttsWord.start_time === currentTTSWord.start_time) {
          break
        }
      }
    }

    const textList = ttsTextObject[chapterId]
    if (!textList) {
      return null
    }

    const textObj = textList.find(text => text.uuid === uuid)
    if (!textObj || !textObj.charDomMap![currentTTSWord.word]) {
      return null
    }

    const mapping = textObj.charDomMap![currentTTSWord.word][currentTTSWordTimes]
    if (!mapping) {
      return null
    }

    const { domPos, textIndexStart, originIndex } = mapping
    const position: TtsReadPosition = {
      ttsChapterId: chapterId,
      ttsCurrentAudioIndex: currentTTSWordIndex,
      ttsCurrentWord: currentTTSWord.word,
      ttsCurrentWordIndex: textIndexStart + originIndex,
      ttsCurrentDomPos: domPos,
      textObjIndex: textObj ? textList.indexOf(textObj) : 0
    }

    if (bookId) {
      setTtsPlayPosition(bookId, position as unknown as Record<string, unknown> as never)
    }

    if (typeof onUpdate === 'function') {
      onUpdate(position)
    }

    return position
  } catch (error) {
    console.warn('setReadDomPosition catch ->', error)
    return null
  }
}

export interface ComputeChapterPlayTimeInput {
  ttsTextObject: Record<number, TtsTextItem[]>
  chapterId: number
  textObjIndex: number
  currentTime: number
  duration: number
}

/** 计算章节累计播放时长（已播段 calcDuration 之和 + 当前段按比例）。对齐 Vue tts-position.js:89 */
export function computeChapterPlayTime({
  ttsTextObject,
  chapterId,
  textObjIndex,
  currentTime,
  duration
}: ComputeChapterPlayTimeInput): number {
  const textList = ttsTextObject[chapterId] || []
  let passedDuration = 0

  for (let index = 0; index < textList.length; index += 1) {
    if (index >= textObjIndex) {
      break
    }
    passedDuration += textList[index].calcDuration || 0
  }

  const currentText = textList[textObjIndex]
  const currentPercent = duration > 0 ? currentTime / duration : 0
  const currentSegmentDuration = currentText ? (currentText.calcDuration || 0) * currentPercent : 0

  return passedDuration + currentSegmentDuration
}

/** 由 domPos+textIdx 反查音频 word 的 start_time（用于从阅读位置续播定位音频偏移）。对齐 Vue tts-position.js:114 */
export function resolveSeekTimeForTextIndex(
  textObj: TtsTextItem | null | undefined,
  words: { word: string; start_time: number; end_time: number }[] | null | undefined,
  domPos: string,
  textIdx: number
): number {
  if (!textObj?.charDomMap || !Array.isArray(words) || !words.length || !domPos) {
    return 0
  }

  for (const key of Object.keys(textObj.charDomMap)) {
    if ((TTS_CONSTANT.IGNORE_CHARS as readonly string[]).includes(key)) {
      continue
    }

    const wordArr = textObj.charDomMap[key]
    const index = wordArr.findIndex(
      item => item.domPos === domPos && item.textIndexStart + item.originIndex === textIdx
    )

    if (index > -1) {
      const matchedWords = words.filter(item => item.word === wordArr[index].word)
      const wordObj = matchedWords[index]
      if (wordObj) {
        return wordObj.start_time || 0
      }
    }
  }

  return 0
}

export interface JudgeTtsInViewInput {
  chapterId: number
  readChapterId: number
  textNodeInView: { pos: string; startTextId: number; endTextId: number }[]
  ttsCurrentDomPos: string
  ttsCurrentWordIndex: number
}

/** 判断当前 TTS 播放位置是否在视口可见区间内（章节相同 + domPos/wordIndex 命中 textNodeInView）。对齐 Vue tts-position.js:143 */
export function judgeTtsInView({
  chapterId,
  readChapterId,
  textNodeInView,
  ttsCurrentDomPos,
  ttsCurrentWordIndex
}: JudgeTtsInViewInput): boolean {
  if (Number(chapterId) !== Number(readChapterId)) {
    return false
  }

  if (!Array.isArray(textNodeInView) || !textNodeInView.length) {
    return false
  }

  return Boolean(
    textNodeInView.find(
      item =>
        item.pos === ttsCurrentDomPos &&
        item.startTextId <= ttsCurrentWordIndex &&
        item.endTextId >= ttsCurrentWordIndex
    )
  )
}
