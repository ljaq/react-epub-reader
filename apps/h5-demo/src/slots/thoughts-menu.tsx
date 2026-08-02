import type { ReaderChromeSlots } from '@react-epub-reader/reader'
import type { ReaderSlotCtx } from '@react-epub-reader/reader'

/** 顶栏「更多」菜单 — 随感入口 */
export function createThoughtsMenuSlot(): ReaderChromeSlots {
  return {
    topBarMoreMenu: (ctx: ReaderSlotCtx) => (
      <button
        type="button"
        className="reader-top-bar__menu-item"
        onClick={() => ctx.navigate(`/book/${ctx.bookId}/thoughts`)}
      >
        <svg
          className="reader-top-bar__menu-item-icon"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M2.12793 13.5788C2.09964 13.5779 2.07179 13.5716 2.04577 13.5605C1.9294 13.5107 1.87542 13.376 1.92521 13.2596C3.57259 9.40918 5.33266 6.6018 7.20544 4.83751C9.03178 3.11696 11.2294 2.17529 13.7984 2.01252C13.8431 2.00968 13.8869 2.02629 13.9185 2.05808C13.9791 2.119 13.9788 2.21749 13.9179 2.27806C13.3085 2.884 12.9003 3.31952 12.6934 3.58461C12.1173 4.32245 11.5418 5.37427 10.9411 6.42493C10.8696 6.54996 10.5242 6.73305 9.90497 6.9742C10.3015 7.1142 10.4801 7.21694 10.4408 7.2824C9.76653 8.405 9.05373 9.42281 8.26873 9.92342C7.55224 10.3803 6.43706 10.3868 4.92319 9.94281L2.64754 13.3142C2.53153 13.4861 2.33517 13.5861 2.12793 13.5788Z"
            fill="black"
          />
        </svg>
        随感
      </button>
    )
  }
}
