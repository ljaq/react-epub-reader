import { describe, it, expect, beforeEach } from 'vitest'
import { useAnnotationStore } from '../store/annotation-store'
import type { LineItem, NoteItem } from '../types'

describe('annotation-store reconcile', () => {
  beforeEach(() => {
    useAnnotationStore.setState({
      selection: null,
      pendingLines: {},
      pendingNotes: {},
      annotationPanelVisible: false,
      annotationDraft: null,
      noteListVisible: false,
      noteListItems: []
    })
  })

  it('merge props + pending lines', () => {
    const pending: LineItem = {
      id: null,
      webLineId: 'er100',
      clientId: 'er100',
      chapterId: 2,
      posInfo: {},
      summary: 'test',
      underlineColor: '#0080FF'
    }
    useAnnotationStore.getState().addPendingLine(2, pending)

    const merged = useAnnotationStore.getState().getMergedChapterLines(2, {})
    expect(merged.data.er100).toEqual(pending)
  })

  it('reconcile clears pending when props return server id with clientId', () => {
    const pending: LineItem = {
      id: null,
      webLineId: 'er200',
      clientId: 'er200',
      chapterId: 2,
      posInfo: {},
      summary: 'test',
      underlineColor: 'rgba(255,157,0,0.3)'
    }
    useAnnotationStore.getState().addPendingLine(2, pending)

    const propsLines: Record<number, Record<string, LineItem>> = {
      2: {
        er200: {
          ...pending,
          id: 999,
          clientId: 'er200'
        }
      }
    }

    useAnnotationStore.getState().reconcileLines(propsLines)
    expect(useAnnotationStore.getState().pendingLines[2]).toBeUndefined()
  })

  it('merge notes pending', () => {
    const note: NoteItem = {
      id: null,
      webNoteId: 'er300',
      clientId: 'er300',
      chapterId: 1,
      posInfo: {},
      summary: 'quote',
      content: 'note body'
    }
    useAnnotationStore.getState().addPendingNote(1, note)
    const merged = useAnnotationStore.getState().getMergedChapterNotes(1, {})
    expect(merged.data.er300.content).toBe('note body')
  })
})

describe('useSelection constants', () => {
  it('LONG_PRESS_MS = 450', async () => {
    const { LONG_PRESS_MS, LONG_PRESS_MOVE_THRESHOLD } = await import('../hooks/useSelection')
    expect(LONG_PRESS_MS).toBe(450)
    expect(LONG_PRESS_MOVE_THRESHOLD).toBe(10)
  })
})
