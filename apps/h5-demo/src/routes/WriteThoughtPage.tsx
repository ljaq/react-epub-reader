import { useParams } from 'react-router-dom'
import { WriteThought } from './thoughts/WriteThought'

export function WriteThoughtPage() {
  const { id } = useParams<{ id: string }>()
  const bookId = Number(id)

  if (!bookId || Number.isNaN(bookId)) {
    return null
  }

  return <WriteThought bookId={bookId} />
}
