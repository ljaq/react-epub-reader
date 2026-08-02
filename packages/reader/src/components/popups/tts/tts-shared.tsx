/** TTS UI 共享图标与常量 — 对照 Vue TtsPopup/index.vue */

export const ICON_SEEK_BACK =
  'https://static-efe-front-h.zhangyuecdn.com/sfm-production/enterprise/632100ce-4527-4c3b-b97c-abdaf47a14ed.png'
export const ICON_SEEK_FORWARD =
  'https://static-efe-front-h.zhangyuecdn.com/sfm-production/enterprise/6d28595d-4bbf-4f33-a300-233a8296009f.png'

export function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M1.86999 8.90145L9.431 16.4636C9.66565 16.6983 10.0265 16.7299 10.2951 16.5584L10.3398 16.5271L10.3798 16.4951L10.4179 16.4597L17.9789 8.89756C18.2383 8.63815 18.2496 8.2246 18.0127 7.95181L17.9789 7.91551L17.9425 7.88164C17.6827 7.65612 17.2953 7.65564 17.035 7.88018L16.9969 7.91554L9.92246 14.9907L2.85201 7.91943C2.59266 7.66005 2.17915 7.64874 1.90636 7.88553L1.87002 7.9194C1.59884 8.19058 1.59883 8.63025 1.86999 8.90145Z"
        fill="black"
      />
    </svg>
  )
}

export function ChevronRightIcon({ opacity = 0.55 }: { opacity?: number }) {
  return (
    <svg className="tts-chevron-right" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path
        d="M4.34461 0.934689L8.12568 4.71519C8.24948 4.83897 8.26025 5.03299 8.158 5.169L8.15605 5.17146C8.14631 5.18441 8.13555 5.19683 8.12376 5.20862L4.34266 8.98915C4.20706 9.12473 3.98723 9.12473 3.85164 8.98913C3.71605 8.85353 3.71607 8.63371 3.85165 8.49814L7.38931 4.96093L3.8536 1.4257C3.72391 1.29602 3.71825 1.08927 3.83665 0.952874L3.85358 0.934707C3.98917 0.799115 4.20901 0.799107 4.34461 0.934689Z"
        fill="black"
        fillOpacity={opacity}
      />
    </svg>
  )
}

export function PrevChapterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M6.91261 13.9415L16.3728 20.2482C17.445 20.9631 18.8937 20.6733 19.6086 19.6011C19.8641 19.2178 20.0004 18.7675 20.0004 18.3068V5.69321C20.0004 4.40454 18.9558 3.35987 17.6671 3.35987C17.2064 3.35987 16.7561 3.49623 16.3728 3.75176L6.91261 10.0585C5.84038 10.7734 5.55064 12.2221 6.26546 13.2943C6.43635 13.5506 6.65629 13.7706 6.91261 13.9415ZM7.65221 12.3698C7.44798 12.0634 7.53076 11.6495 7.83711 11.4453L17.2973 5.13851C17.4068 5.0655 17.5355 5.02654 17.6671 5.02654C18.0353 5.02654 18.3338 5.32502 18.3338 5.69321V18.3068C18.3338 18.4384 18.2948 18.5671 18.2218 18.6766C18.0176 18.9829 17.6037 19.0657 17.2973 18.8615L7.83711 12.5547C7.76388 12.5059 7.70104 12.443 7.65221 12.3698ZM4.83333 3C5.29357 3 5.66667 3.3731 5.66667 3.83333V20.1667C5.66667 20.6269 5.29357 21 4.83333 21C4.3731 21 4 20.6269 4 20.1667V3.83333C4 3.3731 4.3731 3 4.83333 3Z"
        fill="black"
      />
    </svg>
  )
}

export function NextChapterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M17.0878 13.9415L7.62763 20.2482C6.5554 20.9631 5.1067 20.6733 4.39188 19.6011C4.13635 19.2178 4 18.7675 4 18.3068V5.69321C4 4.40454 5.04467 3.35987 6.33333 3.35987C6.79399 3.35987 7.24434 3.49623 7.62763 3.75176L17.0878 10.0585C18.1601 10.7734 18.4498 12.2221 17.735 13.2943C17.5641 13.5506 17.3441 13.7706 17.0878 13.9415ZM16.3482 12.3698C16.5525 12.0634 16.4697 11.6495 16.1633 11.4453L6.70313 5.13851C6.59362 5.0655 6.46495 5.02654 6.33333 5.02654C5.96514 5.02654 5.66667 5.32502 5.66667 5.69321V18.3068C5.66667 18.4384 5.70563 18.5671 5.77863 18.6766C5.98287 18.9829 6.39678 19.0657 6.70313 18.8615L16.1633 12.5547C16.2366 12.5059 16.2994 12.443 16.3482 12.3698ZM19.1671 3C18.7069 3 18.3338 3.3731 18.3338 3.83333V20.1667C18.3338 20.6269 18.7069 21 19.1671 21C19.6273 21 20.0004 20.6269 20.0004 20.1667V3.83333C20.0004 3.3731 19.6273 3 19.1671 3Z"
        fill="black"
      />
    </svg>
  )
}

export function PlayLoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path
        d="M34.2 17.9998C34.2 9.05279 26.947 1.7998 18 1.7998C9.05299 1.7998 1.8 9.05279 1.8 17.9998C1.8 26.9468 9.05299 34.1998 18 34.1998"
        stroke="url(#paint0_linear_tts_loading)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="paint0_linear_tts_loading" x1="17.3027" y1="1.06715" x2="4.60747" y2="27.8522" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.45" />
          <stop offset="1" stopColor="white" stopOpacity="0.01" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function PauseControlIcon() {
  return (
    <svg className="play-pause__control-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M6.11111 2.5C7.33841 2.5 8.33333 3.49492 8.33333 4.72222V15.2778C8.33333 16.5051 7.33841 17.5 6.11111 17.5H4.72222C3.49492 17.5 2.5 16.5051 2.5 15.2778V4.72222C2.5 3.49492 3.49492 2.5 4.72222 2.5H6.11111ZM15.2778 2.5C16.5051 2.5 17.5 3.49492 17.5 4.72222V15.2778C17.5 16.5051 16.5051 17.5 15.2778 17.5H13.8889C12.6616 17.5 11.6667 16.5051 11.6667 15.2778V4.72222C11.6667 3.49492 12.6616 2.5 13.8889 2.5H15.2778Z"
        fill="white"
      />
    </svg>
  )
}

export function PlayControlIcon() {
  return (
    <svg className="play-pause__control-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M16.43 11.6228L8.01551 17.1764C7.11924 17.7679 5.91312 17.5209 5.32158 16.6246C5.11181 16.3068 4.99999 15.9343 4.99999 15.5535V4.4464C4.99999 3.37251 5.87055 2.50195 6.94443 2.50195C7.32525 2.50195 7.69768 2.61378 8.01551 2.82355L16.43 8.37711C17.3263 8.96866 17.5733 10.1748 16.9818 11.071C16.837 11.2904 16.6493 11.4781 16.43 11.6228Z"
        fill="white"
      />
    </svg>
  )
}

export function formatTtsDisplayTime(second: number): string {
  if (!Number.isFinite(second) || second < 0) return '00:00'
  const total = Math.floor(second)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatBookTitle(bookName: string): string {
  const title = bookName || ''
  if (!title) return ''
  if (title.startsWith('《') && title.endsWith('》')) return title
  return `《${title}》`
}
