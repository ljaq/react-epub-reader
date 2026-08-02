import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { ReaderHost } from '../host/ReaderHost'
import { ThoughtsPage } from './ThoughtsPage'
import { WriteThoughtPage } from './WriteThoughtPage'
import { EpubDebugPage } from './EpubDebugPage'

const SAMPLE_BOOK_ID = 12535542

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/book/${SAMPLE_BOOK_ID}/read`} replace />} />
      <Route path="/book/:id/read" element={<ReaderRoute />} />
      <Route path="/book/:id/thoughts" element={<ThoughtsPage />} />
      <Route path="/book/:id/thoughts/write" element={<WriteThoughtPage />} />
      <Route path="/dev/epub" element={<EpubDebugPage />} />
      <Route path="*" element={<Navigate to={`/book/${SAMPLE_BOOK_ID}/read`} replace />} />
    </Routes>
  )
}

function ReaderRoute() {
  const { id } = useParams<{ id: string }>()
  const bookId = Number(id)

  if (!bookId || Number.isNaN(bookId)) {
    return <Navigate to={`/book/${SAMPLE_BOOK_ID}/read`} replace />
  }

  return <ReaderHost bookId={bookId} />
}
