/** 开发调试：模拟 API 失败，验 reconcile rollback 闭环 */

export interface MockFailureFlags {
  line: boolean
  note: boolean
  bookmark: boolean
}

let flags: MockFailureFlags = { line: false, note: false, bookmark: false }

export function getMockFailureFlags(): MockFailureFlags {
  return { ...flags }
}

export function setMockFailureFlags(next: Partial<MockFailureFlags>): void {
  flags = { ...flags, ...next }
}

export function consumeMockLineFailure(): boolean {
  if (!flags.line) return false
  flags = { ...flags, line: false }
  return true
}

export function consumeMockNoteFailure(): boolean {
  if (!flags.note) return false
  flags = { ...flags, note: false }
  return true
}

export function consumeMockBookmarkFailure(): boolean {
  if (!flags.bookmark) return false
  flags = { ...flags, bookmark: false }
  return true
}
