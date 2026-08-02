import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, afterEach } from 'vitest'
import { createEpubAdapter } from '../adapter'

const samplePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/h5-demo/public/sample.epub'
)

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

describe('sample.epub', () => {
  let adapter = createEpubAdapter()

  afterEach(() => {
    adapter.destroy?.()
    adapter = createEpubAdapter()
  })

  it('loads chapters 1-6 including chapter 3 without fragment path errors', async () => {
    const arrayBuffer = toArrayBuffer(readFileSync(samplePath))
    const list = await adapter.loadEpub(arrayBuffer)
    expect(list.length).toBeGreaterThan(5)

    for (const id of [1, 2, 3, 4, 5, 6]) {
      const content = await adapter.getChapterContent(id)
      expect(content.html.length, `chapter ${id} html`).toBeGreaterThan(0)
      expect(content.chapterId).toBe(id)
    }
  })

  it('loads spine items whose href contains #filepos fragment', async () => {
    const arrayBuffer = toArrayBuffer(readFileSync(samplePath))
    const list = await adapter.loadEpub(arrayBuffer)

    const failed: number[] = []
    for (const meta of list) {
      try {
        const content = await adapter.getChapterContent(meta.id)
        if (!content.html) failed.push(meta.id)
      } catch {
        failed.push(meta.id)
      }
    }
    expect(failed, `failed chapter ids: ${failed.join(', ')}`).toEqual([])
  })
})
