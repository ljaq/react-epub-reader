/**
 * TTS 播放引擎 — 依赖注入版（纯逻辑，可单测）。
 *
 * 源码对照：old-vue-reader/utils/tts/tts-engine.js:1-1027
 *
 * 重要架构变更（契约 §6 TTS 音频流）：
 * - 源码 getTTSAudioInfo 直接 import fetchTtsAudioRaw（api/tts）→ 改为构造注入 fetchTtsAudioRaw。
 * - 源码 TtsReport 内部 reportTtsReadTime（api/tts-report）→ 改为构造注入 reportReadTime。
 * - 源码 onAlert = window.alert → 改为构造注入 onAlert。
 * - 音频播放仍通过 bindAudio(audioElement) 绑定 DOM audio 元素（Phase 6 由 hooks 层注入）。
 *
 * 逻辑、常量、边界条件与 Vue 1:1，仅做 TS 化与依赖注入。
 */

import TTS_CONSTANT from './constant'
import { generateUUID } from './uuid'
import { getTtsTimbreConfig, setTtsTimbreConfig } from './storage'
import {
  filterTextByDomPos,
  processLiveTTSContent,
  processTTSContent as buildTTSContent,
  formatTtsMilliseconds
} from './text-process-extract'
import type { TtsTextItem } from './text-process-core'
import { getTTSAudioInfo, isAudioError, isAudioLoaded, isAudioPending } from './audio-api'
import type { FetchTtsAudioRawFn, TtsAudioRawResponse } from './audio-api'
import {
  computeChapterPlayTime,
  resolveSeekTimeForTextIndex,
  setReadDomPosition
} from './position'
import { TtsReport } from './report'
import type { ReportTtsReadTimeFn } from './report'

const { AUDIO_CACHES_NUMBER, MAX_AUDIO_WAIT_ATTEMPTS, SKIP_TIME_SECONDS } = TTS_CONSTANT

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms)
  })
}

export interface TtsAudioObjectEntry {
  chapterId: number
  httpStatus: 'pending' | 'done' | 'error'
  uuid: string
  textObj: TtsTextItem
  textObjIndex: number
  textObjLength: number
  domPos?: string
  isLast?: boolean
  timbreVoice: string
  audioUrl?: string | null
  duration?: number
  reqid?: string
  words?: { word: string; start_time: number; end_time: number; unit_type?: string }[]
  feeToast?: boolean
}

export interface TtsEngineOptions {
  bookId: number | string
  getMaxChapterId?: () => number
  fetchChapterHtml?: (chapterId: number) => Promise<TtsAudioRawResponse | null>
  getReadDomPosition?: () => { domPos: string; textIdx: number }
  getReadRootElement?: () => Element | null
  onStateChange?: (state: Record<string, unknown>) => void
  onChapterChange?: (chapterId: number) => void
  onAlert?: (msg: string) => void
  onToast?: (text: string) => void
  isLoggedIn?: () => boolean
  fetchTtsAudioRaw: FetchTtsAudioRawFn
  reportReadTime?: ReportTtsReadTimeFn
}

export class TtsEngine {
  bookId: number | string
  getMaxChapterId: () => number
  fetchChapterHtml: (chapterId: number) => Promise<TtsAudioRawResponse | null>
  getReadDomPosition: () => { domPos: string; textIdx: number }
  getReadRootElement: () => Element | null
  onStateChange: (state: Record<string, unknown>) => void
  onChapterChange: (chapterId: number) => void
  onAlert: (msg: string) => void
  onToast: (text: string) => void
  isLoggedIn: () => boolean
  private fetchTtsAudioRaw: FetchTtsAudioRawFn

  audioPlayer: (HTMLAudioElement & { audioInfo?: TtsAudioObjectEntry | null }) | null = null
  ttsTextObject: Record<number, TtsTextItem[]> = {}
  ttsAudioObject: Record<number, (TtsAudioObjectEntry | null)[] | null> & {
    chapter_preload?: number[]
  } = {}
  ttsChapterTextInfo: Record<
    number,
    { totalLength: number; ttsChapterDuration: number; ttsChapterDurationStr: string }
  > = {}
  ttsChapterId: number | null = null
  ttsTimbreVoice: string
  ttsCurrentDomPos = ''
  ttsCurrentWordIndex = 0
  ttsCurrentWord = ''
  ttsCurrentAudioIndex = 0
  ttsCurrentPlayTime = 0
  chapterHtmlCache: Record<number, string> = {}
  updateProgressInterval: ReturnType<typeof setInterval> | null = null
  playbackRate = 1
  ratePlayHandler: (() => void) | null = null
  playing = false
  loading = false
  report: TtsReport

  constructor(options: TtsEngineOptions) {
    this.bookId = options.bookId
    this.getMaxChapterId = options.getMaxChapterId || (() => 1)
    this.fetchChapterHtml = options.fetchChapterHtml || (() => Promise.resolve(null))
    this.getReadDomPosition = options.getReadDomPosition || (() => ({ domPos: '', textIdx: 0 }))
    this.getReadRootElement = options.getReadRootElement || (() => null)
    this.onStateChange = options.onStateChange || (() => {})
    this.onChapterChange = options.onChapterChange || (() => {})
    this.onAlert = options.onAlert || (msg => window.alert(msg))
    this.onToast = options.onToast || (() => {})
    this.isLoggedIn = options.isLoggedIn || (() => false)
    this.fetchTtsAudioRaw = options.fetchTtsAudioRaw
    this.ttsTimbreVoice = getTtsTimbreConfig() || TTS_CONSTANT.TTS_TIMBRE_CONFIG

    this.report = new TtsReport({
      getBookId: () => this.bookId,
      getChapterId: () => this.ttsChapterId,
      isLoggedIn: () => this.isLoggedIn(),
      reportReadTime: options.reportReadTime
    })
  }

/** 绑定音频元素（监听 play/playing 同步播放速率）。Phase 6 hooks 注入。 */
  bindAudio(audioElement: HTMLAudioElement): void {
    const player = audioElement as HTMLAudioElement & { audioInfo?: TtsAudioObjectEntry | null }
    if (this.ratePlayHandler && this.audioPlayer) {
      this.audioPlayer.removeEventListener('play', this.ratePlayHandler)
      this.audioPlayer.removeEventListener('playing', this.ratePlayHandler)
    }

    this.audioPlayer = player
    this.ratePlayHandler = () => this.applyPlaybackRate()
    player.addEventListener('play', this.ratePlayHandler)
    player.addEventListener('playing', this.ratePlayHandler)
    this.applyPlaybackRate()
  }

  applyPlaybackRate(): void {
    if (this.audioPlayer) {
      this.audioPlayer.playbackRate = this.playbackRate
    }
  }

/** 设置播放速率并同步到当前 audioPlayer。 */
  setPlaybackRate(rate: number): void {
    this.playbackRate = Number(rate) || 1
    this.applyPlaybackRate()
  }

/** 切换音色并持久化（localStorage）。 */
  setVoiceType(voiceType: string): void {
    this.ttsTimbreVoice = voiceType || TTS_CONSTANT.TTS_TIMBRE_CONFIG
    setTtsTimbreConfig(this.ttsTimbreVoice)
  }

/** 是否末章（chapterId ≥ getMaxChapterId）。 */
  isLastChapter(chapterId: number): boolean {
    return Number(chapterId) >= Number(this.getMaxChapterId())
  }

/** 向 onStateChange 推送当前播放状态（playing/loading/进度/段索引/时长等）。 */
  emitState(extra: Record<string, unknown> = {}): void {
    const curAudio = this.getCurrentAudioByChapterId(this.ttsChapterId)
    const textList = this.ttsTextObject[this.ttsChapterId as number] || []
    this.onStateChange({
      playing: this.playing,
      loading: this.loading,
      chapterId: this.ttsChapterId,
      textObjIndex: curAudio?.textObjIndex ?? 0,
      textObjLength: curAudio?.textObjLength ?? textList.length,
      ttsCurrentDomPos: this.ttsCurrentDomPos,
      ttsCurrentWordIndex: this.ttsCurrentWordIndex,
      ttsCurrentAudioIndex: this.ttsCurrentAudioIndex,
      ttsCurrentPlayTime: this.ttsCurrentPlayTime,
      chapterDurationMs: this.getChapterDurationMs(this.ttsChapterId),
      segmentInView: extra.segmentInView,
      currentTime: this.audioPlayer?.currentTime || 0,
      duration: this.audioPlayer?.duration || 0,
      isLastSegment: Boolean(curAudio?.isLast),
      ...extra
    })
  }

/** 设置指定章的音频对象（仅当 timbreVoice 匹配当前音色；按 AUDIO_CACHES_NUMBER 居中索引）。 */
  setTTSAudioObject(chapterId: number, audioInfo: Partial<TtsAudioObjectEntry> | null, setIndex: number): void {
    if (!audioInfo || (audioInfo as TtsAudioObjectEntry).timbreVoice !== this.ttsTimbreVoice) {
      return
    }

    if (typeof setIndex !== 'number') {
      throw new Error('setTTSAudioObject error => 音频索引必须是数字')
    }

    if (!this.ttsAudioObject[chapterId]) {
      this.ttsAudioObject[chapterId] = new Array(AUDIO_CACHES_NUMBER * 2 + 1).fill(null)
    }

    const audioList = this.ttsAudioObject[chapterId]!
    audioList[setIndex] = Object.assign({}, audioList[setIndex] || {}, audioInfo, {
      chapterId
    }) as TtsAudioObjectEntry
  }

/** 取当前播放音频（AUDIO_CACHES_NUMBER 居中槽位）。 */
  getCurrentAudioByChapterId(chapterId: number | null): TtsAudioObjectEntry | null {
    const audioList = this.ttsAudioObject?.[chapterId as number]
    if (!audioList) {
      return null
    }
    return audioList[AUDIO_CACHES_NUMBER] || null
  }

/** 切换当前播放章并 emit 状态。 */
  setCurrentTTSChapterId(chapterId: number): void {
    this.ttsChapterId = Number(chapterId)
    this.onChapterChange(this.ttsChapterId)
    this.emitState()
  }

/** 取章内容（带 chapterHtmlCache 缓存）。fetchChapterHtml 由宿主注入。 */
  async getChapterContentById(chapterId: number): Promise<TtsAudioRawResponse | null> {
    if (this.chapterHtmlCache[chapterId]) {
      return { code: 0, html: this.chapterHtmlCache[chapterId] }
    }

    const res = await this.fetchChapterHtml(chapterId)
    if (res && Number(res.code) === 0 && res.html) {
      this.chapterHtmlCache[chapterId] = res.html
    }
    return res
  }

/** 解析章 HTML 为 TTS 文本段并缓存 textInfo/textObject。 */
  processTTSContent(content: string, chapterId: number): TtsTextItem[] {
    const result = buildTTSContent(content, chapterId)
    this.ttsChapterTextInfo[chapterId] = result.chapterTextInfo
    this.ttsTextObject[chapterId] = result.textList
    return result.textList
  }

/** 直接对 live bodyEl 切段（保留真实 DOM 节点引用）。 */
  processLiveTTSContent(bodyEl: Element, chapterId: number): TtsTextItem[] {
    const result = processLiveTTSContent(bodyEl, chapterId)
    this.ttsChapterTextInfo[chapterId] = result.chapterTextInfo
    this.ttsTextObject[chapterId] = result.textList
    return result.textList
  }

/** 取章总时长（格式化字符串）。 */
  getChapterDurationFormatted(chapterId: number | null): string {
    const info = this.ttsChapterTextInfo[chapterId as number]
    return info ? info.ttsChapterDurationStr : '00:00'
  }

/** 取章总时长（毫秒）。 */
  getChapterDurationMs(chapterId: number | null): number {
    const info = this.ttsChapterTextInfo[chapterId as number]
    return info ? info.ttsChapterDuration : 0
  }

  private async requestAudioInfo(
    chapterId: number,
    uuid: string,
    text: string
  ): ReturnType<typeof getTTSAudioInfo> {
    return getTTSAudioInfo({
      bookId: this.bookId,
      chapterId,
      uuid,
      text,
      voiceType: this.ttsTimbreVoice,
      retryCount: 3,
      fetchTtsAudioRaw: this.fetchTtsAudioRaw
    })
  }

/** 按 domPos+curTextIdx 初始化当前段音频（拉取并居中到 AUDIO_CACHES_NUMBER）。 */
  async initTTSAudio(chapterId: number, domPos = '', curTextIdx = -1): Promise<boolean> {
    const ttsTextList = this.ttsTextObject[chapterId]
    if (!ttsTextList || !ttsTextList.length) {
      this.onAlert('当前章节没有语音合成的文本')
      return false
    }

    const readRoot = this.getReadRootElement()
    const [textObj, textObjIndex] = filterTextByDomPos(
      ttsTextList,
      domPos,
      curTextIdx >= 0 ? curTextIdx : 0,
      readRoot
    )

    if (!textObj) {
      return false
    }

    const { uuid, text } = textObj
    let audioInfo: Partial<TtsAudioObjectEntry> = {
      httpStatus: 'pending',
      textObj,
      textObjIndex,
      textObjLength: ttsTextList.length,
      uuid,
      domPos: textObj.domPos,
      isLast: textObj.isLast,
      timbreVoice: this.ttsTimbreVoice,
      chapterId
    }

    this.setTTSAudioObject(chapterId, audioInfo, AUDIO_CACHES_NUMBER)
    const audioResponse = await this.requestAudioInfo(chapterId, uuid, text)

    audioInfo = {
      ...audioInfo,
      ...(audioResponse === 'error' ? {} : (audioResponse as object)),
      httpStatus: audioResponse === 'error' ? 'error' : 'done'
    }

    const accurateIndex = this.ttsAudioObject[chapterId]!.findIndex(item => item && item.uuid === uuid)
    this.setTTSAudioObject(chapterId, audioInfo, accurateIndex >= 0 ? accurateIndex : AUDIO_CACHES_NUMBER)
    return audioResponse !== 'error'
  }

/** 向前后辐射预取相邻段音频（AUDIO_CACHES_NUMBER 居中，两侧异步拉取）。 */
  async radiateTTSAudio(chapterId: number): Promise<void> {
    const ttsAudioList = this.ttsAudioObject[chapterId]
    const ttsTextList = this.ttsTextObject[chapterId]
    if (!ttsAudioList || !ttsTextList) {
      return
    }

    for (let i = 0; i < ttsAudioList.length; i += 1) {
      if (i < AUDIO_CACHES_NUMBER) {
        ttsAudioList[i] = null
        continue
      }
      if (i === AUDIO_CACHES_NUMBER) {
        continue
      }
      if (isAudioLoaded(ttsAudioList[i])) {
        continue
      }

      const center = ttsAudioList[AUDIO_CACHES_NUMBER]
      if (!center) {
        continue
      }

      const ttsTextIndex = center.textObjIndex + i - AUDIO_CACHES_NUMBER
      if (ttsTextIndex < 0 || ttsTextIndex >= ttsTextList.length) {
        continue
      }

      const textObj = ttsTextList[ttsTextIndex]
      const audioInfo: Partial<TtsAudioObjectEntry> = {
        httpStatus: 'pending',
        uuid: textObj.uuid,
        textObj,
        textObjIndex: ttsTextIndex,
        textObjLength: ttsTextList.length,
        domPos: textObj.domPos,
        isLast: textObj.isLast,
        timbreVoice: this.ttsTimbreVoice,
        chapterId
      }
      this.setTTSAudioObject(chapterId, audioInfo, i)
    }

    const localTtsAudioList = JSON.parse(JSON.stringify(ttsAudioList)) as (TtsAudioObjectEntry | null)[]
    for (let i = 0; i < localTtsAudioList.length; i += 1) {
      if (localTtsAudioList[i] && localTtsAudioList[i]!.timbreVoice !== this.ttsTimbreVoice) {
        break
      }

      if (i > AUDIO_CACHES_NUMBER && localTtsAudioList[i]) {
        const { uuid, text } = localTtsAudioList[i]!.textObj
        const audioResponse = await this.requestAudioInfo(chapterId, uuid, text)

        const resInfo: Partial<TtsAudioObjectEntry> = {
          ...localTtsAudioList[i],
          ...(audioResponse === 'error' ? {} : (audioResponse as object)),
          httpStatus: audioResponse === 'error' ? 'error' : 'done'
        }
        const accurateIndex = this.ttsAudioObject[chapterId]!.findIndex(item => item && item.uuid === uuid)
        if (accurateIndex !== -1) {
          this.setTTSAudioObject(chapterId, audioResponse ? resInfo : null, accurateIndex)
        }
      }
    }
  }

/** 解析章 HTML → 切段 → 初始化当前段音频 → 辐射预取。 */
  async initTTS(content: string, chapterId: number, domInfo: { domPos?: string; textIdx?: number } = {}): Promise<boolean> {
    if (this.ttsAudioObject?.[chapterId]) {
      this.ttsAudioObject[chapterId] = null
    }
    if (this.ttsTextObject?.[chapterId]?.length > 0) {
      this.ttsTextObject[chapterId] = []
    }

    this.processTTSContent(content, chapterId)
    const result = await this.initTTSAudio(chapterId, domInfo.domPos || '', domInfo.textIdx ?? -1)
    if (result) {
      await this.radiateTTSAudio(chapterId)
    }
    return result
  }

/** 初始化音频元素（设 src/load，等 canplay 或 error）。 */
  async initAudioPlayer(audioInfo: TtsAudioObjectEntry | null): Promise<boolean> {
    if (!this.audioPlayer || !audioInfo?.audioUrl) {
      return false
    }

    return new Promise<boolean>(resolve => {
      const player = this.audioPlayer!
      ;(player as HTMLAudioElement & { audioInfo?: TtsAudioObjectEntry | null }).audioInfo = audioInfo
      player.playbackRate = this.playbackRate
      player.src = audioInfo.audioUrl as string
      player.load()

      const onCanPlay = (): void => {
        player.removeEventListener('canplay', onCanPlay)
        player.removeEventListener('error', onError)
        this.applyPlaybackRate()
        resolve(true)
      }

      const onError = (): void => {
        player.removeEventListener('canplay', onCanPlay)
        player.removeEventListener('error', onError)
        resolve(false)
      }

      player.addEventListener('canplay', onCanPlay)
      player.addEventListener('error', onError)
    })
  }

/** 启动 500ms 进度定时器（setProgressAndTime）。 */
  startProgressUpdates(): void {
    if (this.updateProgressInterval) {
      return
    }
    this.updateProgressInterval = setInterval(() => {
      if (!this.playing) {
        return
      }
      this.setProgressAndTime()
    }, 500)
  }

/** 停止进度定时器。 */
  stopProgressUpdates(): void {
    if (this.updateProgressInterval) {
      clearInterval(this.updateProgressInterval)
      this.updateProgressInterval = null
    }
  }

/** 计算累计播放时长并反推 DOM 位置（setReadDomPosition）后 emit 状态。 */
  setProgressAndTime(): void {
    const curAudio = this.getCurrentAudioByChapterId(this.ttsChapterId)
    if (!curAudio || isAudioPending(curAudio) || !this.audioPlayer || !this.audioPlayer.duration) {
      return
    }

    const playTime = computeChapterPlayTime({
      ttsTextObject: this.ttsTextObject,
      chapterId: this.ttsChapterId as number,
      textObjIndex: curAudio.textObjIndex,
      currentTime: this.audioPlayer.currentTime,
      duration: this.audioPlayer.duration
    })

    this.ttsCurrentPlayTime = playTime
    setReadDomPosition({
      audioPlayer: this.audioPlayer as never,
      ttsTextObject: this.ttsTextObject,
      bookId: this.bookId,
      onUpdate: position => {
        this.ttsCurrentDomPos = position.ttsCurrentDomPos
        this.ttsCurrentWordIndex = position.ttsCurrentWordIndex
        this.ttsCurrentWord = position.ttsCurrentWord
        this.ttsCurrentAudioIndex = position.ttsCurrentAudioIndex
        this.emitState()
      }
    })
    this.emitState()
  }

/** 播放音频（启动上报定时器 + 进度定时器）。 */
  async playAudio(): Promise<void> {
    if (!this.audioPlayer) {
      return
    }
    this.playing = true
    this.loading = false
    this.report.startReportTimer()
    this.startProgressUpdates()

    try {
      await this.audioPlayer.play()
      this.applyPlaybackRate()
      this.emitState()
    } catch (error) {
      console.warn('TTS play failed', error)
      this.clearTTSPlayingState()
    }
  }

/** 暂停音频（停定时器 + 上报）。 */
  pauseAudio(): void {
    this.playing = false
    if (this.audioPlayer) {
      this.audioPlayer.pause()
    }
    this.stopProgressUpdates()
    this.report.stopReportTimer()
    this.emitState()
  }

/** 清除播放态（暂停 + loading=false + emit）。 */
  clearTTSPlayingState(): void {
    this.pauseAudio()
    this.loading = false
    this.emitState()
  }

/** 初始化音频并播放（seamless 时不设 loading）。 */
  async initAudioAndPlay(audioInfo: TtsAudioObjectEntry | null, { seamless = false } = {}): Promise<void> {
    if (!seamless) {
      this.loading = true
      this.emitState()
    }
    const result = await this.initAudioPlayer(audioInfo)
    if (result) {
      await this.playAudio()
    } else {
      this.onAlert('音频初始化失败,请稍后重试')
      this.clearTTSPlayingState()
    }
  }

/** 按 chapterId+domPos+wordIndex 初始化并播放（处理 10003/10004 拦截）。 */
  async initAudioByChapterId(chapterId: number, domPos = '', wordIndex = -1): Promise<boolean> {
    const res = await this.getChapterContentById(chapterId)
    if (Number(res?.code) === 10003) {
      this.onAlert('请先登录!')
      this.clearTTSPlayingState()
      return false
    }
    if (Number(res?.code) === 10004) {
      this.onAlert('该章节为付费章节')
      this.clearTTSPlayingState()
      return false
    }
    if (Number(res?.code) !== 0 || !res?.html) {
      return false
    }

    const ok = await this.initTTS(res.html, chapterId, { domPos, textIdx: wordIndex })
    if (!ok) {
      return false
    }

    this.setCurrentTTSChapterId(chapterId)
    const curAudio = this.getCurrentAudioByChapterId(chapterId)
    return Boolean(curAudio)
  }

/** 按 chapterId 跳转播放（暂停当前 → 初始化新章 → 播放）。 */
  async playAudioByChapterId(chapterId: number, domPos: string, wordIndex: number): Promise<void> {
    this.loading = true
    this.pauseAudio()
    this.ttsCurrentDomPos = ''
    this.ttsCurrentWordIndex = 0
    this.ttsCurrentPlayTime = 0
    const result = await this.initAudioByChapterId(chapterId, domPos, wordIndex)
    if (result) {
      const curAudio = this.getCurrentAudioByChapterId(chapterId)
      const ok = await this.initAudioPlayer(curAudio)
      if (ok) {
        if (this.audioPlayer) {
          this.audioPlayer.currentTime = 0
        }
        await this.playAudio()
      } else {
        this.onAlert('音频初始化失败,请稍后重试')
        this.clearTTSPlayingState()
      }
    } else {
      this.report.stopReportTimer()
      this.loading = false
      this.emitState()
    }
  }

/** 播放提示语音（如「当前书籍已经播完」），播完清除播放态。 */
  async playTextPromptAudio(text: string, chapterId: number): Promise<void> {
    this.onToast(text)
    const audioInfo = await this.requestAudioInfo(chapterId, generateUUID(), text)
    if (audioInfo !== 'error') {
      await this.initAudioAndPlay(audioInfo as TtsAudioObjectEntry)
    }
    this.clearTTSPlayingState()
  }

/** 重试加载失败音频（最多 3 次重试后仍失败则提示）。 */
  async retryLoadAudio(audioInfo: TtsAudioObjectEntry, chapterId: number): Promise<TtsAudioObjectEntry | null> {
    const { uuid, textObj } = audioInfo
    this.loading = true
    this.emitState()

    const audioResponse = await this.requestAudioInfo(chapterId, uuid, textObj.text)

    if (audioResponse !== 'error') {
      const updatedAudio: Partial<TtsAudioObjectEntry> = {
        ...audioInfo,
        ...(audioResponse as object),
        httpStatus: 'done'
      }
      const accurateIndex = this.ttsAudioObject[chapterId]!.findIndex(item => item && item.uuid === uuid)
      if (accurateIndex !== -1) {
        this.setTTSAudioObject(chapterId, updatedAudio, accurateIndex)
      }
      this.loading = false
      this.emitState()
      return updatedAudio as TtsAudioObjectEntry
    }

    this.clearTTSPlayingState()
    this.onAlert('当前音频加载失败，请稍后再试')
    return null
  }

/** 播放下一段：末段则跨章（处理付费拦截 + 预加载下章），否则辐射预取并无缝衔接播放。 */
  async playNextAudio(): Promise<void> {
    const audioList = this.ttsAudioObject[this.ttsChapterId as number]
    if (!audioList) {
      return
    }

    const curAudio = audioList[AUDIO_CACHES_NUMBER]
    let nextAudio = audioList[AUDIO_CACHES_NUMBER + 1] || null

    if (!nextAudio) {
      if (curAudio?.isLast) {
        if (curAudio.feeToast) {
          this.clearTTSPlayingState()
          return
        }
        if (this.isLastChapter(this.ttsChapterId as number)) {
          await this.playTextPromptAudio('当前书籍已经播完...', this.ttsChapterId as number)
          return
        }

        const nextChapterAudioList = this.ttsAudioObject[(this.ttsChapterId as number) + 1] || []
        if (nextChapterAudioList[AUDIO_CACHES_NUMBER]?.textObjIndex === 0) {
          nextAudio = nextChapterAudioList[AUDIO_CACHES_NUMBER] || null
          this.setCurrentTTSChapterId((this.ttsChapterId as number) + 1)
        } else {
          const res = await this.getChapterContentById((this.ttsChapterId as number) + 1)
          if (Number(res?.code) === 10003) {
            await this.playTextPromptAudio('请先登录!', this.ttsChapterId as number)
            ;(this.ttsAudioObject[this.ttsChapterId as number]![AUDIO_CACHES_NUMBER] as TtsAudioObjectEntry).feeToast = true
            this.loading = false
            this.emitState()
            return
          }
          if (Number(res?.code) === 10004) {
            await this.playTextPromptAudio('当前免费章节已播放完毕，请购买后继续播放', this.ttsChapterId as number)
            ;(this.ttsAudioObject[this.ttsChapterId as number]![AUDIO_CACHES_NUMBER] as TtsAudioObjectEntry).feeToast = true
            this.loading = false
            this.emitState()
            return
          }

          await this.initTTS(res!.html as string, (this.ttsChapterId as number) + 1)
          await this.initAudioAndPlay(this.ttsAudioObject[(this.ttsChapterId as number) + 1]![AUDIO_CACHES_NUMBER])
          this.setCurrentTTSChapterId((this.ttsChapterId as number) + 1)
          return
        }
      } else if (curAudio) {
        const nextTtsIndex = curAudio.textObjIndex + 1
        const textObj = this.ttsTextObject[this.ttsChapterId as number][nextTtsIndex]
        if (!textObj) {
          this.clearTTSPlayingState()
          return
        }
        const { uuid, text } = textObj
        const audioInfoResponse = await this.requestAudioInfo(this.ttsChapterId as number, uuid, text)
        nextAudio = {
          chapterId: this.ttsChapterId as number,
          ...(audioInfoResponse === 'error' ? {} : audioInfoResponse),
          uuid,
          textObj,
          textObjIndex: nextTtsIndex,
          textObjLength: this.ttsTextObject[this.ttsChapterId as number].length,
          isLast: textObj.isLast,
          timbreVoice: this.ttsTimbreVoice,
          httpStatus: audioInfoResponse === 'error' ? 'error' : 'done'
        } as TtsAudioObjectEntry
        audioList[AUDIO_CACHES_NUMBER + 1] = nextAudio
      }
    }

    const lastAudio = audioList[audioList.length - 1]
    const textObjIndex: number | null = lastAudio ? lastAudio.textObjIndex + 1 : null

    if (!lastAudio || textObjIndex === null || textObjIndex >= this.ttsTextObject[lastAudio.chapterId].length) {
      audioList.push(null)
      if (!this.isLastChapter(this.ttsChapterId as number)) {
        if (!this.ttsAudioObject.chapter_preload || !this.ttsAudioObject.chapter_preload.includes((this.ttsChapterId as number) + 1)) {
          this.getChapterContentById((this.ttsChapterId as number) + 1).then(res => {
            if (Number(res?.code) === 0 && res?.html) {
              this.ttsAudioObject.chapter_preload = this.ttsAudioObject.chapter_preload || []
              this.ttsAudioObject.chapter_preload.push((this.ttsChapterId as number) + 1)
              this.initTTS(res.html as string, (this.ttsChapterId as number) + 1)
            }
          })
        }
      }
    } else {
      const textObj = this.ttsTextObject[this.ttsChapterId as number][textObjIndex]
      const { uuid, text } = textObj
      const audioInfo: Partial<TtsAudioObjectEntry> = {
        chapterId: this.ttsChapterId as number,
        httpStatus: 'pending',
        uuid,
        textObj,
        textObjIndex,
        textObjLength: this.ttsTextObject[this.ttsChapterId as number].length,
        isLast: textObj.isLast,
        timbreVoice: this.ttsTimbreVoice
      }
      audioList.push(audioInfo as TtsAudioObjectEntry)
      this.requestAudioInfo(this.ttsChapterId as number, uuid, text).then(audioResponse => {
        const accurateIndex = audioList.findIndex(item => item && item.uuid === uuid)
        const updated: Partial<TtsAudioObjectEntry> = {
          ...audioInfo,
          ...(audioResponse === 'error' ? {} : audioResponse),
          httpStatus: audioResponse === 'error' ? 'error' : 'done'
        }
        if (accurateIndex !== -1) {
          audioList[accurateIndex] = updated as TtsAudioObjectEntry
        }
        this.ttsAudioObject[(updated as TtsAudioObjectEntry).chapterId] = audioList
      })
    }

    audioList.shift()

    if (isAudioPending(nextAudio)) {
      this.loading = true
      this.emitState()
      for (let i = 0; i < MAX_AUDIO_WAIT_ATTEMPTS; i += 1) {
        await wait(500 * (i + 1))
        const found = this.ttsAudioObject[this.ttsChapterId as number]!.find(
          item => item && item.uuid === nextAudio!.uuid
        )
        nextAudio = found || null
        if (isAudioLoaded(nextAudio)) {
          await this.initAudioAndPlay(nextAudio, { seamless: true })
          return
        }
        if (i === MAX_AUDIO_WAIT_ATTEMPTS - 1 && !isAudioLoaded(nextAudio)) {
          const retryResult = await this.retryLoadAudio(nextAudio as TtsAudioObjectEntry, (nextAudio as TtsAudioObjectEntry).chapterId)
          if (retryResult) {
            await this.initAudioAndPlay(retryResult, { seamless: true })
          }
        }
      }
    } else if (isAudioError(nextAudio)) {
      const retryResult = await this.retryLoadAudio(nextAudio as TtsAudioObjectEntry, (nextAudio as TtsAudioObjectEntry).chapterId)
      if (retryResult) {
        await this.initAudioAndPlay(retryResult, { seamless: true })
      }
    } else {
      await this.initAudioAndPlay(nextAudio, { seamless: true })
    }
  }

/** 按累计播放时长跳转播放（重新对齐音频队列 + seek）。 */
  async playAudioByTime(playTime: number = 0): Promise<void> {
    const chapterInfo = this.ttsChapterTextInfo[this.ttsChapterId as number]
    if (!chapterInfo) {
      return
    }

    const totalPlayTime = chapterInfo.ttsChapterDuration
    const normalizedPlayTime = Math.max(0, Math.min(playTime, totalPlayTime))

    this.loading = true
    this.pauseAudio()

    const ttsTextList = this.ttsTextObject[this.ttsChapterId as number]
    let passedDuration = 0

    for (let i = 0; i < ttsTextList.length; i += 1) {
      const textObj = ttsTextList[i]
      passedDuration += textObj.calcDuration || 0

      if (passedDuration >= normalizedPlayTime) {
        const { text, uuid } = textObj
        const audioList = this.ttsAudioObject[this.ttsChapterId as number] || []
        const audioIndex = audioList.findIndex(item => item && item.uuid === uuid)

        if (isAudioPending(audioList[audioIndex])) {
          window.setTimeout(() => this.playAudioByTime(normalizedPlayTime), 500)
          return
        }

        if (audioIndex > -1 && isAudioLoaded(audioList[audioIndex])) {
          const newAudioList = new Array(audioList.length).fill(null)
          const offset = AUDIO_CACHES_NUMBER - audioIndex
          for (let j = 0; j < audioList.length; j += 1) {
            const newIndex = j + offset
            if (newIndex >= 0 && newIndex < audioList.length) {
              newAudioList[newIndex] = audioList[j] || null
            }
          }
          this.ttsAudioObject[this.ttsChapterId as number] = newAudioList
          await this.radiateTTSAudio(this.ttsChapterId as number)
        } else {
          let audioInfo: Partial<TtsAudioObjectEntry> = {
            httpStatus: 'pending',
            textObj,
            textObjIndex: i,
            textObjLength: ttsTextList.length,
            uuid,
            domPos: textObj.domPos,
            isLast: textObj.isLast,
            timbreVoice: this.ttsTimbreVoice,
            chapterId: this.ttsChapterId as number
          }
          const audioResponse = await this.requestAudioInfo(this.ttsChapterId as number, uuid, text)
          audioInfo = {
            ...audioInfo,
            ...(audioResponse === 'error' ? {} : audioResponse),
            httpStatus: audioResponse === 'error' ? 'error' : 'done'
          }
          this.ttsAudioObject = {}
          this.setTTSAudioObject(this.ttsChapterId as number, audioInfo, AUDIO_CACHES_NUMBER)
          await this.radiateTTSAudio(this.ttsChapterId as number)
        }

        const curAudio = this.getCurrentAudioByChapterId(this.ttsChapterId)
        const result = await this.initAudioPlayer(curAudio)
        if (result) {
          const percent = (normalizedPlayTime - (passedDuration - (textObj.calcDuration || 0))) / (textObj.calcDuration || 1)
          if (this.audioPlayer) {
            this.audioPlayer.currentTime = this.audioPlayer.duration * percent
          }
          await this.playAudio()
        } else {
          this.onAlert('音频初始化失败,请稍后重试')
          this.clearTTSPlayingState()
        }
        break
      }
    }
  }

/** 后退 SKIP_TIME_SECONDS(15s)。 */
  seekBackward(): Promise<void> {
    const playTime = this.ttsCurrentPlayTime - SKIP_TIME_SECONDS * 1000
    return this.playAudioByTime(playTime)
  }

/** 前进 SKIP_TIME_SECONDS(15s)。 */
  seekForward(): Promise<void> {
    const playTime = this.ttsCurrentPlayTime + SKIP_TIME_SECONDS * 1000
    return this.playAudioByTime(playTime)
  }

/** 跳到上一段（按累计 calcDuration 定位）。 */
  async playPrevSegment(): Promise<void> {
    const curAudio = this.getCurrentAudioByChapterId(this.ttsChapterId)
    if (!curAudio || curAudio.textObjIndex <= 0) {
      return
    }
    const prevIndex = curAudio.textObjIndex - 1
    let passedDuration = 0
    for (let i = 0; i < prevIndex; i += 1) {
      passedDuration += this.ttsTextObject[this.ttsChapterId as number][i].calcDuration || 0
    }
    await this.playAudioByTime(passedDuration + 1)
  }

/** 跳到下一段（手动）。 */
  async playNextSegmentManual(): Promise<void> {
    const curAudio = this.getCurrentAudioByChapterId(this.ttsChapterId)
    if (!curAudio) {
      return
    }
    let passedDuration = 0
    for (let i = 0; i <= curAudio.textObjIndex; i += 1) {
      passedDuration += this.ttsTextObject[this.ttsChapterId as number][i].calcDuration || 0
    }
    await this.playAudioByTime(passedDuration + 1)
  }

/** 通用起播：解析章内容 → initTTSAudio → 辐射预取 → seek+play。getDomInfo/getSeekTime 注入定位策略。 */
  async startTtsAtDomInfo(
    playChapterId: number,
    readChapterId: number,
    html: string,
    liveBodyEl: Element | null,
    {
      autoPlay,
      getDomInfo,
      getSeekTime
    }: {
      autoPlay: boolean
      getDomInfo: () => { domPos: string; textIdx: number }
      getSeekTime: (curAudio: TtsAudioObjectEntry, domInfo: { domPos: string; textIdx: number }) => number
    }
  ): Promise<boolean> {
    this.loading = true
    this.playing = false
    this.emitState()

    if (this.ttsAudioObject?.[playChapterId]) {
      this.ttsAudioObject[playChapterId] = null
    }
    if (this.ttsTextObject?.[playChapterId]?.length > 0) {
      this.ttsTextObject[playChapterId] = []
    }

    if (Number(playChapterId) !== Number(readChapterId)) {
      const res = await this.getChapterContentById(playChapterId)
      if (Number(res?.code) === 10003) {
        this.onAlert('请先登录!')
        this.clearTTSPlayingState()
        return false
      }
      if (Number(res?.code) === 10004) {
        this.onAlert('该章节为付费章节')
        this.clearTTSPlayingState()
        return false
      }
      if (Number(res?.code) !== 0 || !res?.html) {
        this.loading = false
        this.emitState()
        return false
      }
      this.processTTSContent(res.html, playChapterId)
    } else {
      const readRoot = this.getReadRootElement() || liveBodyEl
      if (readRoot) {
        this.processLiveTTSContent(readRoot, playChapterId)
      } else {
        this.processTTSContent(html, playChapterId)
      }
    }

    const domInfo = getDomInfo()
    const ok = await this.initTTSAudio(playChapterId, domInfo.domPos, domInfo.textIdx)
    if (!ok) {
      this.loading = false
      this.emitState()
      return false
    }

    await this.radiateTTSAudio(playChapterId)
    this.setCurrentTTSChapterId(playChapterId)
    const curAudio = this.getCurrentAudioByChapterId(playChapterId)
    if (curAudio && autoPlay) {
      const result = await this.initAudioPlayer(curAudio)
      if (result) {
        const seekTime = getSeekTime(curAudio, domInfo)
        if (this.audioPlayer) {
          this.audioPlayer.currentTime = seekTime || 0
        }
        await this.playAudio()
      } else {
        this.onAlert('音频初始化失败,请稍后重试')
        this.clearTTSPlayingState()
      }
    } else if (curAudio) {
      this.loading = false
      this.emitState()
    } else {
      this.loading = false
      this.emitState()
    }
    return true
  }

/** 从当前阅读位置起播（readChapterId=playChapterId，用 getReadDomPosition 定位 + seek）。 */
  async startFromCurrentRead(
    chapterId: number,
    html: string,
    liveBodyEl: Element | null = null,
    { autoPlay = true }: { autoPlay?: boolean } = {}
  ): Promise<boolean> {
    return this.startFromReadPosition(chapterId, html, { autoPlay, liveBodyEl })
  }

/** 从阅读位置起播（startFromCurrentRead 的实现）。 */
  async startFromReadPosition(
    chapterId: number,
    html: string,
    { autoPlay = true, liveBodyEl = null }: { autoPlay?: boolean; liveBodyEl?: Element | null } = {}
  ): Promise<boolean> {
    return this.startTtsAtDomInfo(Number(chapterId), Number(chapterId), html, liveBodyEl, {
      autoPlay,
      getDomInfo: () => this.getReadDomPosition(),
      getSeekTime: (curAudio, domInfo) =>
        resolveSeekTimeForTextIndex(curAudio.textObj, curAudio.words, domInfo.domPos, domInfo.textIdx)
    })
  }

/** 从上次播放位置续播（playChapterId 与 readChapterId 可能不同，按 audioIndex seek）。 */
  async startFromPlaybackPosition(
    readChapterId: number,
    html: string,
    { autoPlay = true, liveBodyEl = null }: { autoPlay?: boolean; liveBodyEl?: Element | null } = {}
  ): Promise<boolean> {
    const playChapterId = Number(this.ttsChapterId)
    if (!playChapterId || !this.ttsCurrentDomPos) {
      return false
    }

    const domInfo = { domPos: this.ttsCurrentDomPos, textIdx: this.ttsCurrentWordIndex }
    const audioIndex = this.ttsCurrentAudioIndex

    return this.startTtsAtDomInfo(playChapterId, Number(readChapterId), html, liveBodyEl, {
      autoPlay,
      getDomInfo: () => domInfo,
      getSeekTime: curAudio => {
        const words = curAudio?.words
        if (!Array.isArray(words) || !words.length) {
          return 0
        }
        const index = Number.isFinite(audioIndex) && audioIndex >= 0 ? audioIndex : 0
        return words[index]?.start_time || 0
      }
    })
  }

/** 切换音色：重新拉取当前段音频并从对应 word 时间续播。 */
  async changeTimbre(voiceType: string): Promise<void> {
    this.setVoiceType(voiceType)

    if (this.playing) {
      this.pauseAudio()
    }

    const curAudio = this.getCurrentAudioByChapterId(this.ttsChapterId)
    if (!curAudio || !isAudioLoaded(curAudio)) {
      this.onAlert('当前音频还未加载完，请稍后再试！')
      return
    }

    const { chapterId, textObj, words } = curAudio
    const domPos = textObj.domPos
    const originTextIndexStart = textObj.originTextIndexStart || 0
    const previousTime = this.audioPlayer?.currentTime || 0

    this.loading = true
    this.emitState()

    try {
      this.ttsAudioObject = {}

      const ok = await this.initTTSAudio(chapterId as number, domPos, originTextIndexStart)
      if (!ok) {
        return
      }

      await this.radiateTTSAudio(chapterId as number)

      const newAudio = this.getCurrentAudioByChapterId(chapterId)
      if (!newAudio?.audioUrl) {
        return
      }

      const result = await this.initAudioPlayer(newAudio)
      if (!result) {
        this.onAlert('音频初始化失败,请稍后重试')
        this.clearTTSPlayingState()
        return
      }

      if (words && words.length) {
        let wordIndex = words.findIndex(item => item.start_time <= previousTime && item.end_time >= previousTime)
        if (wordIndex < 0) {
          wordIndex = 0
        }
        const seekTime = words[wordIndex]?.start_time || 0
        if (this.audioPlayer) {
          this.audioPlayer.currentTime = seekTime
        }
      }

      this.applyPlaybackRate()
      await this.playAudio()
    } finally {
      if (this.loading) {
        this.loading = false
        this.emitState()
      }
    }
  }

/** 销毁：移除事件监听 + 停定时器 + 停上报。 */
  destroy(): void {
    if (this.ratePlayHandler && this.audioPlayer) {
      this.audioPlayer.removeEventListener('play', this.ratePlayHandler)
      this.audioPlayer.removeEventListener('playing', this.ratePlayHandler)
      this.ratePlayHandler = null
    }
    this.stopProgressUpdates()
    this.report.stopReportTimer()
    this.playing = false
    this.loading = false
  }
}

export { formatTtsMilliseconds }
