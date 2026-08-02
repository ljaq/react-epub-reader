/**
 * 试读结束提示 — 对照 old-vue-reader/components/ReadLoginTip/index.vue。
 */
import { THEME_BG_MAP, THEME_MAP, useSettingsStore, type ThemeKey } from '../../../store/settings-store'
import './read-login-tip.css'

export interface ReadLoginTipProps {
  variant: 'inline' | 'overlay'
  visible: boolean
  onLoginRequired?: (reason: 'trial_end') => void
  onBack?: () => void
}

export function ReadLoginTip(props: ReadLoginTipProps): React.ReactNode {
  const { variant, visible, onLoginRequired, onBack } = props
  const theme = useSettingsStore((s) => s.theme)

  if (!visible) return null

  const message = variant === 'overlay' ? '试读结束，请登录' : '登录后阅读更多精彩内容'
  const themeKey = (theme in THEME_MAP ? theme : 'white') as ThemeKey
  const bg = THEME_BG_MAP[themeKey] || THEME_BG_MAP.white
  const color = THEME_MAP[themeKey]?.color || THEME_MAP.white.color

  const handleLogin = () => {
    onLoginRequired?.('trial_end')
  }

  if (variant === 'overlay') {
    return (
      <div
        className="read-login-tip read-login-tip--overlay"
        style={{ backgroundColor: bg, color }}
      >
        <button type="button" className="read-login-tip__back" aria-label="返回" onClick={onBack}>
          <svg
            className="read-login-tip__back-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M13.3186 2.24403L4.24405 11.3172C3.96243 11.5988 3.92451 12.0318 4.13029 12.3542L4.16783 12.4078L4.20622 12.4558L4.24866 12.5015L13.3233 21.5747C13.6346 21.886 14.1308 21.8995 14.4582 21.6153L14.5018 21.5747L14.5424 21.5311C14.813 21.2193 14.8136 20.7544 14.5441 20.442L14.5017 20.3963L6.01146 11.907L14.497 3.42246C14.8083 3.11124 14.8219 2.61503 14.5377 2.28768L14.4971 2.24408C14.1717 1.91866 13.6441 1.91864 13.3186 2.24403Z"
              fill={color}
            />
          </svg>
        </button>
        <p className="read-login-tip__text read-login-tip__text--overlay">{message}</p>
        <button type="button" className="read-login-tip__btn read-login-tip__btn--overlay" onClick={handleLogin}>
          登录
        </button>
      </div>
    )
  }

  return (
    <div className="read-login-tip read-login-tip--inline">
      <div className="read-login-tip__panel" style={{ backgroundColor: bg, color }}>
        <p className="read-login-tip__text">{message}</p>
        <button type="button" className="read-login-tip__btn" onClick={handleLogin}>
          登录
        </button>
      </div>
    </div>
  )
}
