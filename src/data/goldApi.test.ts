import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSpotUsd } from './goldApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(response: { ok: boolean; body?: unknown }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: response.ok, json: () => Promise.resolve(response.body) }))
}

describe('fetchSpotUsd', () => {
  it('returns the spot price for the metal', async () => {
    stubFetch({ ok: true, body: { symbol: 'XAU', price: 4107 } })

    expect(await fetchSpotUsd('XAU')).toBe(4107)
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('https://api.gold-api.com/price/XAU')
  })

  it('throws when the service does not answer', async () => {
    stubFetch({ ok: false })

    await expect(fetchSpotUsd('XAG')).rejects.toThrow(/gold-api/)
  })

  it('throws when the response carries no usable price', async () => {
    stubFetch({ ok: true, body: { symbol: 'XAG' } })

    await expect(fetchSpotUsd('XAG')).rejects.toThrow(/XAG/)
  })
})
