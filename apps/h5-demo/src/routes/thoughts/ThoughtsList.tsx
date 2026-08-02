/**
 * 随感列表 — 1:1 对照 Vue ThoughtsList/index.vue
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  cancelThoughtLike,
  fetchThoughtList,
  likeThought,
  type ThoughtItem,
  type ThoughtListResponse
} from '../../api'
import './thoughts.css'

const EMPTY_IMG =
  'https://static-efe-front-h.zhangyuecdn.com/sfm-production/enterprise/37212b9e-311e-4e92-8c61-3a21970c685b.png'

const DEFAULT_PAGER = { hasNext: 0, nextRowId: -1 }

function BackIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M13.3186 2.24403L4.24409 11.3172C3.96247 11.5988 3.92454 12.0318 4.13032 12.3542L4.16786 12.4078L4.20625 12.4558L4.24869 12.5015L13.3233 21.5747C13.6346 21.886 14.1309 21.8995 14.4582 21.6153L14.5018 21.5747L14.5424 21.5311C14.813 21.2193 14.8136 20.7544 14.5442 20.442L14.5017 20.3963L6.01149 11.907L14.4971 3.42246C14.8083 3.11124 14.8219 2.61503 14.5378 2.28768L14.4971 2.24408C14.1717 1.91866 13.6441 1.91864 13.3186 2.24403Z"
        fill="black"
      />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9C4 8.37049 4.29639 7.77771 4.8 7.4L10.8 2.9C11.5111 2.36667 12.4889 2.36667 13.2 2.9L19.2 7.4C19.7036 7.77771 20 8.37049 20 9V17C20 19.2091 18.2091 21 16 21H8C5.79086 21 4 19.2091 4 17V9Z"
        stroke="black"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="14" y1="10.9142" x2="10.4142" y2="14.5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LikeIconFilled() {
  return (
    <svg className="thoughts-list__like-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M10.8788 4.43874C11.0758 3.42155 10.4728 2.44975 9.56499 2.16438C8.54564 1.84395 7.61489 2.4978 7.34441 3.83195C7.16555 4.71419 6.50012 5.30649 5.24903 5.63032C4.51364 5.82067 4 6.48419 4 7.24381V12.3331C4 13.2536 4.74619 13.9998 5.66667 13.9998H11.3156C12.1072 13.9998 12.7896 13.4429 12.9484 12.6674L13.9494 7.77854C14.134 6.87677 13.5527 5.99607 12.6509 5.81143C12.5409 5.78891 12.4289 5.77756 12.3166 5.77756H10.4392C10.6549 5.28165 10.8018 4.83631 10.8788 4.43874ZM2.55556 7.11089C2.86238 7.11089 3.11111 7.35962 3.11111 7.66644V12.7776C3.11111 13.0844 2.86238 13.3331 2.55556 13.3331C2.24873 13.3331 2 13.0844 2 12.7776V7.66644C2 7.35962 2.24873 7.11089 2.55556 7.11089Z"
        fill="url(#paint0_linear_1932_7024)"
      />
      <defs>
        <linearGradient id="paint0_linear_1932_7024" x1="13.9836" y1="8.04188" x2="2" y2="8.04188" gradientUnits="userSpaceOnUse">
          <stop stopColor="#70B2FF" />
          <stop offset="1" stopColor="#157FFB" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function LikeIconOutline() {
  return (
    <svg className="thoughts-list__like-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M10.8788 4.43874C11.0758 3.42155 10.4728 2.44975 9.56499 2.16438C8.54564 1.84395 7.61489 2.4978 7.34441 3.83195C7.16555 4.71419 6.50012 5.30649 5.24903 5.63032C4.51364 5.82066 4 6.48419 4 7.24381V12.3331C4 13.2536 4.74619 13.9998 5.66667 13.9998H11.3156C12.1072 13.9998 12.7896 13.4429 12.9484 12.6674L13.9494 7.77854C14.134 6.87677 13.5527 5.99607 12.6509 5.81143C12.5409 5.7889 12.4289 5.77756 12.3166 5.77756H10.4392C10.6549 5.28165 10.8018 4.83631 10.8788 4.43874ZM5.11111 7.24381C5.11111 6.9906 5.28233 6.76943 5.52746 6.70598C7.16022 6.28336 8.1619 5.39177 8.43337 4.05272C8.58025 3.3282 8.88379 3.11496 9.23178 3.22436C9.60851 3.34278 9.87581 3.7736 9.78791 4.22748C9.7078 4.64113 9.51882 5.15692 9.21897 5.76849C9.16672 5.87507 9.13955 5.99219 9.13955 6.11089C9.13955 6.54044 9.48777 6.88867 9.91733 6.88867H12.3166C12.354 6.88867 12.3913 6.89245 12.428 6.89996C12.7286 6.9615 12.9224 7.25507 12.8608 7.55566L11.8598 12.4445C11.8069 12.7031 11.5794 12.8887 11.3156 12.8887H5.66667C5.35984 12.8887 5.11111 12.6399 5.11111 12.3331V7.24381ZM2.55556 7.11089C2.86238 7.11089 3.11111 7.35962 3.11111 7.66644V12.7776C3.11111 13.0844 2.86238 13.3331 2.55556 13.3331C2.24873 13.3331 2 13.0844 2 12.7776V7.66644C2 7.35962 2.24873 7.11089 2.55556 7.11089Z"
        fill="black"
        fillOpacity="0.35"
      />
    </svg>
  )
}

export interface ThoughtsListProps {
  bookId: number
}

function getLikeCountText(item: ThoughtItem): string {
  if (item.likeNumStr) return item.likeNumStr
  const count = item.likeNum ?? item.likeCount ?? 0
  return count > 0 ? String(count) : ''
}

export function ThoughtsList({ bookId }: ThoughtsListProps) {
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [list, setList] = useState<ThoughtItem[]>([])
  const [pager, setPager] = useState(DEFAULT_PAGER)
  const [likingIds, setLikingIds] = useState<Record<number, boolean>>({})

  const hasMore = Number(pager.hasNext) === 1

  const applyResponse = useCallback((res: ThoughtListResponse, append = false) => {
    const lists = res.lists || []
    const nextPager = res.pager || { ...DEFAULT_PAGER }
    setList((prev) => (append ? [...prev, ...lists] : lists))
    setPager(nextPager)
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    setList([])
    setPager({ ...DEFAULT_PAGER })
    try {
      const res = await fetchThoughtList(bookId)
      applyResponse(res)
    } finally {
      setLoading(false)
    }
  }, [bookId, applyResponse])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetchThoughtList(bookId, pager.nextRowId)
      applyResponse(res, true)
    } finally {
      setLoadingMore(false)
    }
  }, [bookId, hasMore, loadingMore, pager.nextRowId, applyResponse])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      if (loading || loadingMore || !hasMore) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollTop + clientHeight >= scrollHeight - 48) {
        void loadMore()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [loading, loadingMore, hasMore, loadMore])

  const updateLikeCount = (item: ThoughtItem, delta: number) => {
    const prev = item.likeNum ?? item.likeCount ?? 0
    const nextCount = Math.max(0, prev + delta)
    item.likeNum = nextCount
    item.likeCount = nextCount
    item.likeNumStr = nextCount > 0 ? String(nextCount) : ''
  }

  const handleLike = async (item: ThoughtItem) => {
    if (likingIds[item.id]) return
    const itemId = item.id
    const wasLiked = Boolean(item.liked)
    const delta = wasLiked ? -1 : 1

    setLikingIds((s) => ({ ...s, [itemId]: true }))
    setList((prev) =>
      prev.map((entry) => {
        if (entry.id !== itemId) return entry
        const next = { ...entry, liked: !wasLiked }
        updateLikeCount(next, delta)
        return next
      })
    )

    try {
      if (wasLiked) {
        await cancelThoughtLike(bookId, itemId)
      } else {
        await likeThought(bookId, itemId)
      }
    } catch {
      setList((prev) =>
        prev.map((entry) => {
          if (entry.id !== itemId) return entry
          const next = { ...entry, liked: wasLiked }
          updateLikeCount(next, -delta)
          return next
        })
      )
    } finally {
      setLikingIds((s) => {
        const next = { ...s }
        delete next[itemId]
        return next
      })
    }
  }

  return (
    <div className="thoughts-list">
      <div className="thoughts-list__header">
        <button type="button" className="thoughts-list__back" aria-label="返回" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
        <span className="thoughts-list__title">随感</span>
        <button type="button" className="thoughts-list__edit" aria-label="首页" onClick={() => navigate('/')}>
          <HomeIcon />
        </button>
      </div>

      <div
        ref={scrollRef}
        className={`thoughts-list__body${list.length > 0 ? ' thoughts-list__body--with-footer' : ''}`}
      >
        {loading ? (
          <div className="thoughts-loading">加载中…</div>
        ) : list.length === 0 ? (
          <div className="thoughts-empty">
            <div className="thoughts-empty__img">
              <img src={EMPTY_IMG} alt="empty" />
            </div>
            <p className="thoughts-empty__text">暂无随感</p>
            <button
              type="button"
              className="thoughts-empty__btn"
              onClick={() => navigate(`/book/${bookId}/thoughts/write`)}
            >
              写随感
            </button>
          </div>
        ) : (
          <div className="thoughts-list__items">
            {list.map((item) => (
              <div key={item.id} className="thoughts-list__item">
                <div className="thoughts-list__item-head">
                  {item.avatar ? (
                    <div className="thoughts-list__avatar">
                      <img src={item.avatar} alt={item.nickName || item.nick || ''} />
                    </div>
                  ) : (
                    <div className="thoughts-list__avatar thoughts-list__avatar--placeholder" />
                  )}
                  <div className="thoughts-list__meta">
                    <span className="thoughts-list__nickname">{item.nickName || item.nick || '读者'}</span>
                    <span className="thoughts-list__time">{item.time}</span>
                  </div>
                  <button
                    type="button"
                    className={`thoughts-list__like-btn${item.liked ? ' thoughts-list__like-btn--liked' : ''}`}
                    disabled={Boolean(likingIds[item.id])}
                    aria-label={item.liked ? '取消点赞' : '点赞'}
                    onClick={() => void handleLike(item)}
                  >
                    {item.liked && getLikeCountText(item) ? (
                      <span className="thoughts-list__like-count">{getLikeCountText(item)}</span>
                    ) : null}
                    {item.liked ? <LikeIconFilled /> : <LikeIconOutline />}
                  </button>
                </div>
                <p className="thoughts-list__content">{item.content}</p>
              </div>
            ))}
            <div className="thoughts-load-more">
              {loadingMore ? '加载中…' : hasMore ? '上拉加载更多' : '没有更多了'}
            </div>
          </div>
        )}
      </div>

      {list.length > 0 ? (
        <div className="thoughts-list__footer">
          <button
            type="button"
            className="thoughts-list__write-btn"
            onClick={() => navigate(`/book/${bookId}/thoughts/write`)}
          >
            写随感
          </button>
        </div>
      ) : null}
    </div>
  )
}
