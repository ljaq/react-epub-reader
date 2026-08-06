/**
 * 弹簧动画积分器 — 物理翻页手感核心（phase-11 性能/手感专项）。
 *
 * - 半隐式欧拉积分 + 固定 4ms 子步进：帧率无关（60Hz/120Hz 结果一致），
 *   数值稳定（显式欧拉在高 stiffness 下会发散）。
 * - 速度连续：from/velocity 直接接管松手瞬间的运动状态，动画起点不跳变。
 * - 可取消：快速连滑打断路径 cancel() 后由调用方立即写终值落定。
 * - 纯 TS、now/rAF 可注入：单测用假时钟手动步进，不依赖真实定时器。
 *
 * 调参目标（PAGE_FLIP_SPRING）：视觉时长 ≈280ms ease-out、几乎无过冲、
 * 速度连续。自然频率 ω = √(stiffness/mass) = 20 rad/s；
 * 阻尼比 ζ = damping / (2·√(stiffness·mass)) = 0.9（过冲 ≈0.15%，
 * 整页 360px 位移过冲 <1px 不可见）；落定 ≈370ms（含尾部不可见收敛）。
 *
 * 单位约定：对外 API 速度为 px/ms（与手势采样一致）；内部积分统一换算为
 * 秒制（px/s、s），stiffness/damping 为秒制参数（s⁻² / s⁻¹）。
 */

export interface SpringConfig {
  /** 弹簧刚度（越大越快） */
  stiffness: number
  /** 阻尼（越大越快停、过冲越小） */
  damping: number
  /** 质量 */
  mass: number
}

/** 翻页弹簧默认参数（两模式共用；调手感只改这里）。秒制：stiffness s⁻²、damping s⁻¹ */
export const PAGE_FLIP_SPRING: SpringConfig = {
  stiffness: 400,
  damping: 36,
  mass: 1
}

/** 落定判定：位置误差 < 0.5px 且速度 < 0.01px/ms（=10px/s）视为静止 */
export const SPRING_SETTLE_POSITION_EPSILON = 0.5
export const SPRING_SETTLE_VELOCITY_EPSILON = 0.01

/** 硬超时兜底：异常参数/极端初速度下强制落定（防动画永远不结束） */
export const SPRING_MAX_DURATION_MS = 600

/** 固定积分子步长（ms）：帧间隔再大也按 4ms 切片积分，保证帧率无关 */
export const SPRING_SUB_STEP_MS = 4

/** 单帧最大补偿时长：页面切后台 rAF 停摆恢复后不追帧（防瞬移） */
const MAX_FRAME_DELTA_MS = 64

/** 秒制换算：内部积分统一用秒（弹簧参数为秒制） */
const MS_PER_SECOND = 1000

export interface SpringAnimationInput {
  /** 起点位置（px） */
  from: number
  /** 目标位置（px） */
  to: number
  /** 初速度（px/ms；向右为正，与位移同向） */
  velocity: number
  /** 覆盖默认弹簧参数 */
  config?: Partial<SpringConfig>
  /** 每帧位置回调（含首帧 from 与末帧 to） */
  onUpdate: (x: number) => void
  /** 落定后回调（恰好一次；cancel 不触发） */
  onComplete: () => void
  /** 可注入时钟（默认 performance.now，退 Date.now） */
  now?: () => number
  /** 可注入 rAF（测试手动步进） */
  raf?: (cb: () => void) => number
  /** 可注入 cancelAnimationFrame */
  cancelRaf?: (id: number) => void
  /** 覆盖硬超时兜底（默认 SPRING_MAX_DURATION_MS=600；慢速弹簧需放宽） */
  maxDurationMs?: number
  /**
   * 覆盖落定容差（velocity 与 API 速度同单位 /ms；默认按 px 标定：0.5px / 0.01px·ms⁻¹）。
   * 归一化空间（如 curl 路径参数 t∈[0,1]）必须按量程覆盖，否则容差比量程还大，
   * 弹簧在半途即误判落定并被 snap 到终点（动画"瞬间完成"）。
   */
  settleTolerance?: { position: number; velocity: number }
}

export interface SpringAnimation {
  /** 取消动画：不再触发 onUpdate/onComplete；幂等 */
  cancel: () => void
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()
const defaultRaf = (cb: () => void): number => requestAnimationFrame(cb)
const defaultCancelRaf = (id: number): void => cancelAnimationFrame(id)

export function createSpringAnimation(input: SpringAnimationInput): SpringAnimation {
  const { from, to, onUpdate, onComplete } = input
  const cfg: SpringConfig = { ...PAGE_FLIP_SPRING, ...input.config }
  const maxDurationMs = input.maxDurationMs ?? SPRING_MAX_DURATION_MS
  const settlePosition = input.settleTolerance?.position ?? SPRING_SETTLE_POSITION_EPSILON
  const settleVelocity = (input.settleTolerance?.velocity ?? SPRING_SETTLE_VELOCITY_EPSILON) * MS_PER_SECOND
  const now = input.now ?? defaultNow
  const raf = input.raf ?? defaultRaf
  const cancelRaf = input.cancelRaf ?? defaultCancelRaf

  let x = from
  // 速度换算为 px/s（输入 px/ms），与秒制积分对齐
  let v = input.velocity * MS_PER_SECOND
  let last = now()
  const startedAt = last
  let rafId: number | null = null
  let done = false

  const finish = (): void => {
    if (done) return
    done = true
    if (rafId !== null) {
      cancelRaf(rafId)
      rafId = null
    }
    onUpdate(to)
    onComplete()
  }

  const step = (): void => {
    if (done) return
    const t = now()
    let dtMs = t - last
    last = t
    if (dtMs < 0) dtMs = 0
    if (dtMs > MAX_FRAME_DELTA_MS) dtMs = MAX_FRAME_DELTA_MS
    let dt = dtMs / MS_PER_SECOND

    // 半隐式欧拉（symplectic Euler）：先更新速度再更新位置，固定子步进（秒制）
    const subStep = SPRING_SUB_STEP_MS / MS_PER_SECOND
    while (dt > 0) {
      const h = Math.min(subStep, dt)
      const accel = (-cfg.stiffness * (x - to) - cfg.damping * v) / cfg.mass
      v += accel * h
      x += v * h
      dt -= h
    }

    const settled =
      Math.abs(x - to) < settlePosition &&
      Math.abs(v) < settleVelocity
    if (settled || t - startedAt > maxDurationMs) {
      finish()
      return
    }

    onUpdate(x)
    rafId = raf(step)
  }

  // 首帧同步回调起点，保证调用方状态一致（fromX 无跳变起步）
  onUpdate(from)
  rafId = raf(step)

  return {
    cancel: () => {
      if (done) return
      done = true
      if (rafId !== null) {
        cancelRaf(rafId)
        rafId = null
      }
    }
  }
}
