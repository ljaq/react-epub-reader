import { useParams } from 'react-router-dom'
import { ThoughtsList } from './thoughts/ThoughtsList'

export function ThoughtsPage() {
  const { id } = useParams<{ id: string }>()
  const bookId = Number(id)

  if (!bookId || Number.isNaN(bookId)) {
    return null
  }

  return <ThoughtsList bookId={bookId} />
}
