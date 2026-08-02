/** HTTP 请求辅助 — 注入 rentId / appId（对齐 Vue request-helper） */

export const DEFAULT_RENT_ID = 105883
export const DEFAULT_APP_ID = '13673ce1'

const BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'https://api.zongheng.com'

export interface RequestParams {
  rentId?: number
  appId?: string
  [key: string]: unknown
}

function buildQuery(params: RequestParams): string {
  const merged: Record<string, string> = {
    rentId: String(params.rentId ?? DEFAULT_RENT_ID),
    appId: String(params.appId ?? DEFAULT_APP_ID)
  }
  Object.entries(params).forEach(([key, value]) => {
    if (key === 'rentId' || key === 'appId') return
    if (value === undefined || value === null) return
    merged[key] = String(value)
  })
  return new URLSearchParams(merged).toString()
}

export async function apiGet<T = unknown>(
  path: string,
  params: RequestParams = {}
): Promise<T> {
  const qs = buildQuery(params)
  const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}${qs}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function apiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  params: RequestParams = {}
): Promise<T> {
  const qs = buildQuery(params)
  const url = `${BASE_URL}${path}?${qs}`
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}
