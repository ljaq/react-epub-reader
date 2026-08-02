/**
 * 选区 caret range 工具。
 *
 * 源码对照：old-vue-reader/utils/selection-range.js:1-20
 */

/** 由坐标取 caret Range（兼容 caretRangeFromPoint / caretPositionFromPoint）。对齐 Vue selection-range.js:1 */
export function getCaretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document

  if (doc.caretRangeFromPoint) {
    return doc.caretRangeFromPoint(x, y)
  }

  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y)
    if (!position) {
      return null
    }
    const range = doc.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }

  return null
}
