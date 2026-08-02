/**
 * 目录弹窗 — 源码对照 old-vue-reader/components/CatalogPopup/index.vue（逐屏复刻）。
 *
 * 分页目录（PAGE_SIZE=50）、付费章拦截（chapterAccess[id].needPurchase/needLogin → onLoginRequired）、
 * 书封点击 → onBookDetailClick(bookId)。
 *
 * 与 Vue 差异：reader 包零 fetch，章节列表由宿主通过 chapterList prop 全量注入，
 * 故无 loadChapterPage/loading 态，displayChapters 直接按当前页切片自 chapterList。
 */
import { useEffect, useMemo, useState } from 'react'
import type { BookMeta, ChapterAccess, ChapterMeta } from '../../../types'
import { useUiStore } from '../../../store/ui-store'
import { useReadingStore } from '../../../store/reading-store'
import { findChapterIndex } from '../../../core/chapter-buffer'
import { navigateToChapter } from '../../chrome/navigation'
import { callGoTtsChapter } from '../tts/tts-actions'
import { useTtsStore } from '../../../store/tts-store'
import { CloseIcon } from '../../settings/FontIcons'
import './catalog-popup.css'

const PAGE_SIZE = 50

export interface CatalogPopupProps {
  bookId: number
  bookMeta: BookMeta
  chapterList: ChapterMeta[]
  chapterAccess: Record<number, ChapterAccess>
  isLoggedIn: boolean
  onBookDetailClick?: (bookId: number) => void
  onLoginRequired?: (reason: 'paid' | 'trial_end' | 'auth') => void
}

function RangeChevron() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M10.4309 5.06892L6.23567 9.26419C6.1055 9.39436 5.89444 9.39436 5.76427 9.26419L1.569 5.06892C1.43883 4.93875 1.43883 4.72769 1.569 4.59752C1.63152 4.53501 1.7163 4.49989 1.80471 4.49989L10.1952 4.49989C10.3793 4.49989 10.5286 4.64913 10.5286 4.83322C10.5286 4.92163 10.4934 5.00641 10.4309 5.06892Z" fill="black" fillOpacity="0.55" />
    </svg>
  )
}

function BookArrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M5.21352 1.12202L9.75081 5.65862C9.89936 5.80716 9.9123 6.03998 9.7896 6.20319L9.78726 6.20614C9.77557 6.22168 9.76265 6.23659 9.7485 6.25074L5.21119 10.7874C5.04847 10.9501 4.78467 10.9501 4.62196 10.7874C4.45925 10.6246 4.45927 10.3608 4.62198 10.1982L8.86716 5.95351L4.62431 1.71123C4.46868 1.55562 4.4619 1.30751 4.60397 1.14384L4.62429 1.12204C4.787 0.959329 5.0508 0.959319 5.21352 1.12202Z" fill="black" fillOpacity="0.55" />
    </svg>
  )
}

function RangeCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M13.7473 7.23991C14.1197 6.86746 14.1197 6.2636 13.7473 5.89115C13.3748 5.5187 12.771 5.5187 12.3985 5.89115L8.21736 10.0723L5.65471 7.50967C5.28226 7.13722 4.6784 7.13722 4.30595 7.50967C3.9335 7.88212 3.9335 8.48598 4.30595 8.85843L7.27322 11.8257C7.79465 12.3471 8.64006 12.3471 9.16149 11.8257L13.7473 7.23991Z" fill="black" />
    </svg>
  )
}

export function CatalogPopup(props: CatalogPopupProps): React.ReactNode {
  const {
    bookId,
    bookMeta,
    chapterList,
    chapterAccess,
    isLoggedIn,
    onBookDetailClick,
    onLoginRequired
  } = props
  void isLoggedIn

  const visible = useUiStore((s) => s.popups.catalog)
  const catalogSource = useUiStore((s) => s.catalogSource)
  const ttsPopupOpen = useUiStore((s) => s.popups.tts)
  const closePopup = useUiStore((s) => s.closePopup)
  const chapterId = useReadingStore((s) => s.chapterId)

  const totalChapters = chapterList.length
  const totalPage = Math.max(1, Math.ceil(totalChapters / PAGE_SIZE))

  const pageForChapter = (id: number): number => {
    const index = findChapterIndex(chapterList, id)
    if (index < 0) return 1
    return Math.floor(index / PAGE_SIZE) + 1
  }

  const [currentPage, setCurrentPage] = useState(1)
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false)

  // 打开时定位到当前章所在页
  useEffect(() => {
    if (visible) {
      setRangeDropdownOpen(false)
      setCurrentPage(pageForChapter(chapterId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const rangeOptions = useMemo(() => {
    const options: { start: number; end: number; page: number }[] = []
    for (let page = 1; page <= totalPage; page += 1) {
      const start = (page - 1) * PAGE_SIZE + 1
      const end = page * PAGE_SIZE
      options.push({ start, end, page })
    }
    return options
  }, [totalPage])

  const formatRangeLabel = (option: { start: number; end: number }) =>
    `${option.start}-${option.end} 章`

  const currentRangeLabel = (() => {
    const option = rangeOptions.find((item) => item.page === currentPage)
    return option ? formatRangeLabel(option) : '1-50 章'
  })()

  const displayChapters = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return chapterList.slice(start, start + PAGE_SIZE)
  }, [chapterList, currentPage])

  const displayTitle = (() => {
    const title = bookMeta?.bookName || ''
    if (!title) return ''
    if (title.startsWith('《') && title.endsWith('》')) return title
    return `《${title}》`
  })()
  const displayAuthor = bookMeta?.author || ''

  const handleClose = () => closePopup('catalog')
  const handleRootClick = () => setRangeDropdownOpen(false)
  const handleListScroll = () => setRangeDropdownOpen(false)
  const toggleRangeDropdown = () => setRangeDropdownOpen((v) => !v)

  const handleRangeSelect = (page: number) => {
    setRangeDropdownOpen(false)
    if (page === currentPage) return
    setCurrentPage(page)
  }

  const handleBookDetail = () => {
    onBookDetailClick?.(bookId)
  }

  const handleChapterClick = (id: number) => {
    const acc = chapterAccess[Number(id)]
    if (acc) {
      if (acc.needLogin) {
        onLoginRequired?.('auth')
        return
      }
      if (acc.needPurchase) {
        onLoginRequired?.('paid')
        return
      }
    }
    if (catalogSource === 'tts' && useTtsStore.getState().sessionActive) {
      void callGoTtsChapter(Number(id))
    } else {
      navigateToChapter(Number(id))
    }
    closePopup('catalog')
  }

  if (!visible) return null

  const maskClass = `catalog-popup-mask${ttsPopupOpen ? ' catalog-popup-mask--tts' : ''}`

  return (
    <div className={maskClass} onClick={handleClose}>
      <div className="catalog-popup-root" onClick={(e) => e.stopPropagation()}>
        <div className="catalog-popup" onClick={handleRootClick}>
          <div className="catalog-popup__header">
            <button type="button" className="catalog-popup__close" aria-label="关闭" onClick={handleClose}>
              <CloseIcon />
            </button>
            <span className="catalog-popup__title">目录</span>
          </div>

          <button type="button" className="catalog-popup__book" onClick={handleBookDetail}>
            <div className="catalog-popup__cover-wrapper">
              {bookMeta && bookMeta.bookPic ? (
                <img className="catalog-popup__cover" src={bookMeta.bookPic} alt="" />
              ) : (
                <div className="catalog-popup__cover" />
              )}
            </div>
            <div className="catalog-popup__book-info">
              <div className="catalog-popup__book-title">{displayTitle}</div>
              <div className="catalog-popup__book-author">{displayAuthor}</div>
              <div className="catalog-popup__book-read">已读：5分钟</div>
            </div>
            <span className="catalog-popup__book-arrow">
              <BookArrow />
            </span>
          </button>

          <div className="catalog-popup__range-bar">
            <span className="catalog-popup__total">共{totalChapters}章</span>
            <div className="catalog-popup__range-wrap">
              <button type="button" className="catalog-popup__range-trigger" onClick={toggleRangeDropdown}>
                <span>{currentRangeLabel}</span>
                <RangeChevron />
              </button>
              {rangeDropdownOpen ? (
                <div className="catalog-popup__range-menu" onClick={(e) => e.stopPropagation()}>
                  {rangeOptions.map((option) => (
                    <button
                      key={option.page}
                      type="button"
                      className={`catalog-popup__range-item${option.page === currentPage ? ' catalog-popup__range-item--active' : ''}`}
                      onClick={() => handleRangeSelect(option.page)}
                    >
                      <span className="catalog-popup__range-check">
                        {option.page === currentPage ? <RangeCheck /> : null}
                      </span>
                      <span>{formatRangeLabel(option)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="catalog-popup__list" onScroll={handleListScroll}>
            {displayChapters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`catalog-popup__chapter${Number(item.id) === Number(chapterId) ? ' catalog-popup__chapter--active' : ''}`}
                onClick={() => handleChapterClick(item.id)}
              >
                {item.chapterName}
              </button>
            ))}
            {!displayChapters.length ? (
              <div className="catalog-popup__empty">暂无章节</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
