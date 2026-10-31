import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError, UnknownSymbolError } from './alphaVantage'
import { forgetCachedSeries, getSeries } from './priceCache'
import { loadPriceCache, savePriceCache } from './storage'
import type { PricePoint } from '../domain/types'

vi.mock('./alphaVantage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./alphaVantage')>()
  return { ...actual, fetchWeekly: vi.fn(), fetchMetalWeekly: vi.fn(), fetchUsdEurRate: vi.fn() }
})

const { fetchWeekly, fetchMetalWeekly, fetchUsdEurRate } = await import('./alphaVantage')
const fetchWeeklyMock = vi.mocked(fetchWeekly)
const fetchMetalWeeklyMock = vi.mocked(fetchMetalWeekly)
const fetchUsdEurRateMock = vi.mocked(fetchUsdEurRate)

const TODAY = '2026-03-01'
const freshSeries: PricePoint[] = [{ date: '2026-02-27', close: 123 }]

beforeEach(() => {
  localStorage.clear()
  fetchWeeklyMock.mockReset()
  fetchMetalWeeklyMock.mockReset()
  fetchUsdEurRateMock.mockReset()
})

describe('getSeries', () => {
  it('uses the cached series without calling the API when it is from today', async () => {
    savePriceCache({ 'SAP.DEX': { fetchedAt: TODAY, series: freshSeries } })

    const result = await getSeries(['SAP.DEX'], 'demo-key', TODAY)

    expect(result.series).toEqual({ 'SAP.DEX': freshSeries })
    expect(fetchWeeklyMock).not.toHaveBeenCalled()
  })

  it('fetches and caches a symbol that has never been loaded', async () => {
    fetchWeeklyMock.mockResolvedValue(freshSeries)

    const result = await getSeries(['SAP.DEX'], 'demo-key', TODAY)

    expect(result.series).toEqual({ 'SAP.DEX': freshSeries })
    expect(loadPriceCache()).toEqual({ 'SAP.DEX': { fetchedAt: TODAY, series: freshSeries } })
  })

  it('refetches when the cached entry is from an earlier day', async () => {
    savePriceCache({ 'SAP.DEX': { fetchedAt: '2026-02-20', series: [{ date: '2026-02-13', close: 100 }] } })
    fetchWeeklyMock.mockResolvedValue(freshSeries)

    const result = await getSeries(['SAP.DEX'], 'demo-key', TODAY)

    expect(result.series).toEqual({ 'SAP.DEX': freshSeries })
    expect(fetchWeeklyMock).toHaveBeenCalledOnce()
  })

  it('stops calling the API after a rate limit and falls back to cached data for later symbols', async () => {
    savePriceCache({
      'EUNL.DEX': { fetchedAt: '2026-02-20', series: [{ date: '2026-02-13', close: 50 }] },
    })
    fetchWeeklyMock
      .mockRejectedValueOnce(new RateLimitError('limit'))
      .mockResolvedValueOnce(freshSeries)

    const result = await getSeries(['SAP.DEX', 'EUNL.DEX'], 'demo-key', TODAY)

    expect(fetchWeeklyMock).toHaveBeenCalledOnce() // never called for EUNL.DEX
    expect(result.rateLimited).toEqual(['SAP.DEX', 'EUNL.DEX'])
    expect(result.series['EUNL.DEX']).toEqual([{ date: '2026-02-13', close: 50 }])
    expect(result.series['SAP.DEX']).toBeUndefined()
  })

  it('records a failed symbol but keeps fetching the rest', async () => {
    fetchWeeklyMock
      .mockRejectedValueOnce(new UnknownSymbolError('nope'))
      .mockResolvedValueOnce(freshSeries)

    const result = await getSeries(['BOGUS', 'SAP.DEX'], 'demo-key', TODAY)

    expect(result.failed).toEqual(['BOGUS'])
    expect(result.series['SAP.DEX']).toEqual(freshSeries)
    expect(fetchWeeklyMock).toHaveBeenCalledTimes(2)
  })

  it('marks a failed symbol in the cache so it is not retried the same day', async () => {
    fetchWeeklyMock.mockRejectedValueOnce(new UnknownSymbolError('nope'))

    await getSeries(['BOGUS'], 'demo-key', TODAY)

    expect(loadPriceCache()).toEqual({ BOGUS: { fetchedAt: TODAY, series: [], failed: true } })
  })

  it('does not call the API again for a symbol that already failed today', async () => {
    savePriceCache({ BOGUS: { fetchedAt: TODAY, series: [], failed: true } })

    const result = await getSeries(['BOGUS'], 'demo-key', TODAY)

    expect(fetchWeeklyMock).not.toHaveBeenCalled()
    expect(result.failed).toEqual(['BOGUS'])
    expect(result.series.BOGUS).toBeUndefined()
  })

  it('retries a symbol that failed on an earlier day', async () => {
    savePriceCache({ BOGUS: { fetchedAt: '2026-02-20', series: [], failed: true } })
    fetchWeeklyMock.mockResolvedValue(freshSeries)

    const result = await getSeries(['BOGUS'], 'demo-key', TODAY)

    expect(fetchWeeklyMock).toHaveBeenCalledOnce()
    expect(result.series.BOGUS).toEqual(freshSeries)
  })
})

describe('getSeries with precious metals', () => {
  it('converts a metal series to EUR using the fetched USD/EUR rate', async () => {
    fetchUsdEurRateMock.mockResolvedValue(0.9)
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.series.XAU).toEqual([{ date: '2026-02-27', close: 3600 }])
    expect(fetchUsdEurRateMock).toHaveBeenCalledOnce()
  })

  it('caches the converted series and the EUR/USD rate separately', async () => {
    fetchUsdEurRateMock.mockResolvedValue(0.9)
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    await getSeries(['XAU'], 'demo-key', TODAY)

    const cache = loadPriceCache()
    expect(cache.XAU).toEqual({ fetchedAt: TODAY, series: [{ date: '2026-02-27', close: 3600 }] })
    expect(cache.EURUSD).toEqual({ fetchedAt: TODAY, series: [{ date: TODAY, close: 0.9 }] })
  })

  it('reuses one cached EUR/USD rate for both gold and silver, fetching it only once', async () => {
    fetchUsdEurRateMock.mockResolvedValue(0.9)
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    const result = await getSeries(['XAU', 'XAG'], 'demo-key', TODAY)

    expect(fetchUsdEurRateMock).toHaveBeenCalledOnce()
    expect(fetchMetalWeeklyMock).toHaveBeenCalledTimes(2)
    expect(result.series.XAU).toEqual([{ date: '2026-02-27', close: 3600 }])
    expect(result.series.XAG).toEqual([{ date: '2026-02-27', close: 3600 }])
  })

  it('reuses an already-cached EUR/USD rate from today without refetching it', async () => {
    savePriceCache({ EURUSD: { fetchedAt: TODAY, series: [{ date: TODAY, close: 0.8 }] } })
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(fetchUsdEurRateMock).not.toHaveBeenCalled()
    expect(result.series.XAU).toEqual([{ date: '2026-02-27', close: 3200 }])
  })

  it('does not surface the EUR/USD bookkeeping entry as a symbol in the result', async () => {
    fetchUsdEurRateMock.mockResolvedValue(0.9)
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.series.EURUSD).toBeUndefined()
    expect(result.rateLimited).toEqual([])
    expect(result.failed).toEqual([])
  })

  it('marks the metal symbol as rate-limited when the EUR/USD fetch itself is rate-limited', async () => {
    fetchUsdEurRateMock.mockRejectedValue(new RateLimitError('limit'))

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.rateLimited).toEqual(['XAU'])
    expect(fetchMetalWeeklyMock).not.toHaveBeenCalled()
  })

  it('stops fetching a second metal once the EUR/USD rate-limits on the first', async () => {
    fetchUsdEurRateMock.mockRejectedValue(new RateLimitError('limit'))

    const result = await getSeries(['XAU', 'XAG'], 'demo-key', TODAY)

    expect(result.rateLimited).toEqual(['XAU', 'XAG'])
    expect(fetchUsdEurRateMock).toHaveBeenCalledOnce()
    expect(fetchMetalWeeklyMock).not.toHaveBeenCalled()
  })

  it('a rate-limited EUR/USD fetch also stops a later regular stock in the same call', async () => {
    fetchUsdEurRateMock.mockRejectedValue(new RateLimitError('limit'))

    const result = await getSeries(['XAU', 'SAP.DEX'], 'demo-key', TODAY)

    expect(result.rateLimited).toEqual(['XAU', 'SAP.DEX'])
    expect(fetchWeeklyMock).not.toHaveBeenCalled()
  })

  it('marks the metal as failed (not rate-limited) when the EUR/USD fetch fails for another reason', async () => {
    fetchUsdEurRateMock.mockRejectedValue(new Error('unexpected shape'))

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.failed).toEqual(['XAU'])
    expect(result.rateLimited).toEqual([])
  })

  it('does not retry a same-day failed EUR/USD fetch for a second metal', async () => {
    fetchUsdEurRateMock.mockRejectedValueOnce(new Error('unexpected shape'))
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    const result = await getSeries(['XAU', 'XAG'], 'demo-key', TODAY)

    expect(fetchUsdEurRateMock).toHaveBeenCalledOnce()
    expect(result.failed).toEqual(['XAU', 'XAG'])
    expect(fetchMetalWeeklyMock).not.toHaveBeenCalled()
  })

  it('marks a metal symbol as failed when its own history fetch fails (not a rate limit)', async () => {
    fetchUsdEurRateMock.mockResolvedValue(0.9)
    fetchMetalWeeklyMock.mockRejectedValue(new UnknownSymbolError('nope'))

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.failed).toEqual(['XAU'])
    expect(loadPriceCache().XAU).toEqual({ fetchedAt: TODAY, series: [], failed: true })
  })
})

describe('forgetCachedSeries', () => {
  it('removes only the given symbol from the cache', () => {
    savePriceCache({
      'SAP.DEX': { fetchedAt: TODAY, series: freshSeries },
      'EUNL.DEX': { fetchedAt: TODAY, series: freshSeries },
    })

    forgetCachedSeries('SAP.DEX')

    expect(loadPriceCache()).toEqual({ 'EUNL.DEX': { fetchedAt: TODAY, series: freshSeries } })
  })

  it('does nothing when the symbol is not cached', () => {
    savePriceCache({ 'EUNL.DEX': { fetchedAt: TODAY, series: freshSeries } })

    forgetCachedSeries('SAP.DEX')

    expect(loadPriceCache()).toEqual({ 'EUNL.DEX': { fetchedAt: TODAY, series: freshSeries } })
  })
})
