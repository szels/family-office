import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchUsdEurSeries } from './frankfurter'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(response: { ok: boolean; body?: unknown }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: response.ok, json: () => Promise.resolve(response.body) }))
}

describe('fetchUsdEurSeries', () => {
  it('maps the ECB rates to ascending price points', async () => {
    stubFetch({
      ok: true,
      body: { rates: { '2026-01-05': { EUR: 0.857 }, '2026-01-02': { EUR: 0.853 } } },
    })

    expect(await fetchUsdEurSeries('2026-01-01', '2026-01-09')).toEqual([
      { date: '2026-01-02', close: 0.853 },
      { date: '2026-01-05', close: 0.857 },
    ])
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      'https://api.frankfurter.dev/v1/2026-01-01..2026-01-09?from=USD&to=EUR',
    )
  })

  it('throws when the service does not answer', async () => {
    stubFetch({ ok: false })

    await expect(fetchUsdEurSeries('2026-01-01', '2026-01-09')).rejects.toThrow(/Frankfurter/)
  })

  it('throws when no rates come back', async () => {
    stubFetch({ ok: true, body: { rates: {} } })

    await expect(fetchUsdEurSeries('2026-01-01', '2026-01-09')).rejects.toThrow(/keine/)
  })
})
