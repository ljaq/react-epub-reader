import { URL as NodeUrl } from 'node:url'

if (typeof URL !== 'undefined' && typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:vitest-mock'
}

if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => undefined
}

if (typeof globalThis.URL === 'undefined') {
  globalThis.URL = NodeUrl as unknown as typeof URL
}
