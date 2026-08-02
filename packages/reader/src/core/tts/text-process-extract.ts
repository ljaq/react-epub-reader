/**
 * TTS 文本处理 — DOM 提取、章节处理、按 domPos 过滤、切段导出。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-text-process.js:245-517
 */

import TTS_CONSTANT from './constant'
import { generateUUID } from './uuid'
import {
  buildCharDomMap,
  buildChapterTextInfo,
  computeDomPosFromTextNode,
  isValidText,
  textJoin,
  textSplit,
  type TtsTextItem
} from './text-process-core'

const { TTS_TEXT_SPLIT_TYPE, TTS_TEXT_TIME_DURATION } = TTS_CONSTANT

/**
 * 遍历 DOM 提取文本段（跳过 rt/rp，每段生成 uuid+domPos+拆分类型），textJoin 合并过短段，
 * 附加 isLast/calcText/calcDuration/charDomMap。对齐 Vue tts-text-process.js:287。
 */
export function extractTextWithUuidsFromDOM(rootNode: Element): TtsTextItem[] {
  let result: TtsTextItem[] = []

  const traverse = (node: Node): void => {
    const { parentNode, nodeType, nodeValue, childNodes } = node

    if (nodeType === Node.TEXT_NODE && (nodeValue || '').trim()) {
      const tagName = parentNode ? (parentNode as HTMLElement).tagName.toLowerCase() : ''
      if (tagName === 'rt' || tagName === 'rp') {
        return
      }

      const domPos = computeDomPosFromTextNode(node)
      const uuid = generateUUID()
      ;(parentNode as HTMLElement).dataset.uuid = uuid
      ;(parentNode as HTMLElement).dataset.domPos = domPos
      const originalText = nodeValue || ''
      const textSlice = textSplit(originalText) || []

      textSlice.forEach((text, index) => {
        result.push({
          uuid: `${uuid}__${index}`,
          text,
          originText: text,
          originTextLength: text.length,
          originTextIndexStart:
            index === 0 ? 0 : result[result.length - 1].originTextIndexEnd + 1,
          originTextIndexEnd:
            index === 0 ? text.length - 1 : result[result.length - 1].originTextIndexEnd + text.length,
          textLength: text.length,
          textTotalLength: originalText.length,
          textIndex: index,
          tag: (parentNode as HTMLElement).tagName.toLowerCase(),
          node: node as Text,
          textSpliteType: textSlice.length > 1 ? TTS_TEXT_SPLIT_TYPE.SPLICED : TTS_TEXT_SPLIT_TYPE.UNSPLICED,
          textSpliteTypeText:
            textSlice.length > 1 ? TTS_TEXT_SPLIT_TYPE.SPLICED_TEXT : TTS_TEXT_SPLIT_TYPE.UNSPLICED_TEXT,
          domPos
        })
      })
    } else if (nodeType === Node.ELEMENT_NODE) {
      Array.from(childNodes).forEach(child => traverse(child))
    }
  }

  traverse(rootNode)
  result = textJoin(result)

  return result.filter((item, index) => {
    item.isLast = index === result.length - 1
    item.calcText = item.text.replace(/[ \n]+/g, '')
    item.calcTextLength = item.calcText.length
    item.calcDuration = item.calcTextLength * TTS_TEXT_TIME_DURATION
    item.charDomMap = buildCharDomMap(item)
    return isValidText(item.calcText)
  })
}

export interface ProcessTtsContentResult {
  chapterId: number
  textList: TtsTextItem[]
  chapterTextInfo: {
    totalLength: number
    ttsChapterDuration: number
    ttsChapterDurationStr: string
  }
}

/** 用 DOMParser 解析章节 HTML 为 virtualDom 后切段（用于非 live 场景）。对齐 Vue tts-text-process.js:354 */
export function processTTSContent(content: string, chapterId: number): ProcessTtsContentResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div class="virtualDom">${content}</div>`, 'text/html')
  const virtualDom = doc.getElementsByClassName('virtualDom')[0]
  const ttsTextList = extractTextWithUuidsFromDOM(virtualDom as Element)

  return {
    chapterId,
    textList: ttsTextList,
    chapterTextInfo: buildChapterTextInfo(ttsTextList)
  }
}

/** 直接对 live bodyEl 切段（避免重新解析 HTML，保留真实 DOM 节点引用）。对齐 Vue tts-text-process.js:367 */
export function processLiveTTSContent(bodyEl: Element | null, chapterId: number): ProcessTtsContentResult {
  if (!bodyEl) {
    return processTTSContent('', chapterId)
  }

  const ttsTextList = extractTextWithUuidsFromDOM(bodyEl)
  return {
    chapterId,
    textList: ttsTextList,
    chapterTextInfo: buildChapterTextInfo(ttsTextList)
  }
}

function findTextNodeSibling(node: Node | null): Node[] {
  if (!node || !node.parentNode) {
    return []
  }

  const childNodes = Array.from(node.parentNode.childNodes)
  let currentNodeIndex = -1
  const validNodes = childNodes.filter((item, index) => {
    if (item === node) {
      currentNodeIndex = index
    }
    return (
      index > currentNodeIndex &&
      ((item.nodeType === Node.TEXT_NODE && (item.textContent || '').trim().length > 0) ||
        item.nodeType === Node.ELEMENT_NODE)
    )
  })

  if (!validNodes.length) {
    return findTextNodeSibling(node.parentNode)
  }

  return validNodes
}

function findFirstTextNode(node: Node): Text | null {
  const childNodes = Array.from(node.childNodes)
  for (const childNode of childNodes) {
    if (childNode.nodeType === Node.TEXT_NODE && (childNode.textContent || '').trim().length > 0) {
      return childNode as Text
    }
    if (childNode.childNodes && childNode.childNodes.length > 0) {
      const firstTextNode = findFirstTextNode(childNode)
      if (firstTextNode) {
        return firstTextNode
      }
    }
  }
  return null
}

function findTextNodeByDomPos(
  textList: TtsTextItem[],
  targetDomPos: string,
  curTextIdx: number
): TtsTextItem | null {
  return (
    textList.find(item => {
      if (
        item.domPos === targetDomPos &&
        item.originTextIndexStart <= curTextIdx &&
        item.originTextIndexEnd >= curTextIdx
      ) {
        return item
      }
      if (item.appendTextDomPos && item.appendTextDomPos.includes(targetDomPos)) {
        return item
      }
      return null
    }) || null
  )
}

/**
 * 按 domPos+curTextIdx 在切段中定位起始段：先精确匹配，再 domPos 递增重试 10 次，
 * 再用 readRootElement 兄弟节点兜底。返回 [textObj, index]。对齐 Vue tts-text-process.js:436。
 */
export function filterTextByDomPos(
  textList: TtsTextItem[] | null | undefined,
  domPos: string,
  curTextIdx: number = 0,
  readRootElement: Element | null = null
): [TtsTextItem | null, number] {
  if (!textList || !textList.length) {
    return [null, 0]
  }

  if (!domPos) {
    return [textList[0], 0]
  }

  let textNode = findTextNodeByDomPos(textList, domPos, curTextIdx)

  let count = 0
  let searchDomPos = domPos

  while (!textNode && count < 10) {
    const parts = searchDomPos.split('=').map(item => parseInt(item, 10))
    parts[parts.length - 1] += 1
    searchDomPos = parts.join('=')
    textNode = findTextNodeByDomPos(textList, searchDomPos, curTextIdx)
    count += 1
  }

  if (!textNode && readRootElement) {
    const domPosParts = domPos.split('=')
    let node: Node | null = readRootElement

    for (let i = 0; i < domPosParts.length; i += 1) {
      const elementIndex = Number(domPosParts[i])
      if (!node?.childNodes?.[elementIndex]) {
        node = null
        break
      }
      node = node.childNodes[elementIndex]
    }

    if (node) {
      const siblingsNodes = findTextNodeSibling(node)

      for (let i = 0; i < siblingsNodes.length; i += 1) {
        const item = siblingsNodes[i]
        if (item.nodeType === Node.TEXT_NODE && (item.textContent || '').trim().length > 0) {
          const matched = textList.find(
            entry => entry.domPos && (item.parentElement as HTMLElement)?.dataset?.domPos === entry.domPos
          )
          if (matched) {
            textNode = matched
          }
          break
        }
        if (item.nodeType === Node.ELEMENT_NODE) {
          const firstText = findFirstTextNode(item)
          const uuid = firstText?.parentElement?.dataset?.uuid
          if (uuid) {
            textNode = textList.find(entry => entry.uuid.indexOf(uuid) > -1) || null
            break
          }
        }
      }
    }
  }

  if (textNode && textNode.uuid) {
    const textIndex = textList.findIndex(item => item.uuid === textNode!.uuid)
    if (textIndex >= 0) {
      return [textList[textIndex], textIndex]
    }
  }

  if (textNode && textNode.domPos) {
    const textIndex = textList.findIndex(
      item => item.uuid === textNode!.uuid || item.domPos === textNode!.domPos
    )
    if (textIndex >= 0) {
      return [textList[textIndex], textIndex]
    }
  }

  return [textList[0], 0]
}

/** 提取章节 HTML 的文本段列表（无正文回退提示语）。tts-segments.js 的 re-export 实现。对齐 Vue tts-text-process.js:511 */
export function extractTtsSegments(html: string): string[] {
  const { textList } = processTTSContent(html, 0)
  if (!textList.length) {
    return ['暂无正文内容，请继续阅读。']
  }
  return textList.map(item => item.text)
}

export { formatTtsMilliseconds } from './text-process-core'
