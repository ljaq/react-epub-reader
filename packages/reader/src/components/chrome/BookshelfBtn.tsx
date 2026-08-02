/**
 * 加入书架按钮 — 源码对照 old-vue-reader/components/ReaderChrome/BookshelfBtn/index.vue。
 *
 * 未加入书架时显示，点击 → onBookshelfAdd(bookId)。宿主负责 API + 更新 user.inBookshelf。
 * 动画 0.28s（右→左滑入）。
 */
export interface BookshelfBtnProps {
  visible: boolean
  inBookshelf: boolean
  bookId: number
  onBookshelfAdd?: (bookId: number) => void
}

export function BookshelfBtn(props: BookshelfBtnProps): React.ReactNode {
  const { visible, inBookshelf, bookId, onBookshelfAdd } = props
  if (inBookshelf) {
    return null
  }
  const handleClick = () => {
    if (!bookId) return
    onBookshelfAdd?.(bookId)
  }
  return (
    <button
      type="button"
      className={`reader-bookshelf-btn${visible ? ' reader-bookshelf-btn--visible' : ''}`}
      onClick={handleClick}
    >
      加入书架
    </button>
  )
}
