/**
 * 复用 reader 内全屏章节 loading 样式（reader-content.css）
 */
export function ReaderBootLoading() {
  return (
    <div className="reader-content__chapter-loading" aria-busy="true" aria-live="polite">
      <div className="reader-content__chapter-loading-mask" />
      <div className="reader-content__chapter-loading-spinner" />
    </div>
  )
}
