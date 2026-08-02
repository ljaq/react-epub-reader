/**
 * TTS 全局动作引用 — 供 ToolBar / TopBar 等非 TtsLayer 子树调用。
 */
import type { useTtsSession } from '../../../hooks/useTtsSession'

type TtsSessionActions = ReturnType<typeof useTtsSession>

let sessionActions: Partial<TtsSessionActions> = {}

export function registerTtsSessionActions(actions: TtsSessionActions): void {
  sessionActions = actions
}

export function unregisterTtsSessionActions(): void {
  sessionActions = {}
}

export const openTtsPopupRef = {
  current: (): Promise<void> => sessionActions.openTtsPopup?.() ?? Promise.resolve()
}

export function callOpenTtsPopup(): Promise<void> {
  return sessionActions.openTtsPopup?.() ?? Promise.resolve()
}

export function callStartTtsPlayback(): Promise<boolean> {
  return sessionActions.startTtsPlayback?.() ?? Promise.resolve(false)
}

export function callStopTtsSession(): void {
  sessionActions.stopTtsSession?.()
}

export function callGoTtsChapter(chapterId: number): Promise<void> {
  return sessionActions.goTtsChapter?.(chapterId) ?? Promise.resolve()
}

export { stopTtsSessionGlobal } from '../../../hooks/useTtsSession'
