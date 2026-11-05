import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError, UnknownSymbolError } from './alphaVantage'
import { forgetCachedSeries, getSeries, orderByStaleness } from './priceCache'
import { loadIsinCache, loadPriceCache, savePriceCache } from './storage'
import type { PricePoint } from '../domain/types'

vi.mock('./alphaVantage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./alphaVantage')>()
  return { ...actual, fetchWeekly: vi.fn(), fetchMetalWeekly: vi.fn() }
})
vi.mock('./onvista', () => ({ fetchDailyHistory: vi.fn(), lookupIsin: vi.fn() }))
vi.mock('./frankfurter', () => ({ fetchUsdEurSeries: vi.fn() }))
vi.mock('./goldApi', () => ({ fetchSpotUsd: vi.fn() }))

const { fetchWeekly, fetchMetalWeekly } = await import('./alphaVantage')
const { fetchDailyHistory, lookupIsin } = await import('./onvista')
const { fetchUsdEurSeries } = await import('./frankfurter')
const { fetchSpotUsd } = await import('./goldApi')
const fetchWeeklyMock = vi.mocked(fetchWeekly)
const fetchMetalWeeklyMock = vi.mocked(fetchMetalWeekly)
const fetchDailyHistoryMock = vi.mocked(fetchDailyHistory)
const lookupIsinMock = vi.mocked(lookupIsin)
const fetchUsdEurSeriesMock = vi.mocked(fetchUsdEurSeries)
const fetchSpotUsdMock = vi.mocked(fetchSpotUsd)

const TODAY = '2026-03-01'
/** getSeries asks for one year of lead-in before the symbol's first date (default: today). */
const FROM = '2025-03-01'
const freshSeries: PricePoint[] = [{ date: '2026-02-27', close: 123 }]
const dailySeries: PricePoint[] = [
  { date: '2026-02-26', close: 120 },
  { date: '2026-02-27', close: 123 },
]

beforeEach(() => {
  localStorage.clear()
  for (const mock of [fetchWeeklyMock, fetchMetalWeeklyMock, fetchDailyHistoryMock, lookupIsinMock, fetchUsdEurSeriesMock, fetchSpotUsdMock]) {
    mock.mockReset()
  }
  // By default onvista is down and the spot price unavailable, so tests
  // written for the Alpha Vantage path exercise it as the fallback.
  lookupIsinMock.mockResolvedValue('DE0007164600')
  fetchDailyHistoryMock.mockRejectedValue(new Error('onvista down'))
  fetchSpotUsdMock.mockRejectedValue(new Error('gold-api down'))
})

describe('orderByStaleness', () => {
  it('puts never-loaded symbols first, then oldest fetchedAt first', () => {
    const cache = {
      NEW: { fetchedAt: '2026-02-28', series: [] },
      OLD: { fetchedAt: '2026-02-01', series: [] },
    }

    expect(orderByStaleness(['NEW', 'OLD', 'NEVER'], cache)).toEqual(['NEVER', 'OLD', 'NEW'])
  })

  it('keeps the input order for ties and does not mutate the input', () => {
    const symbols = ['B', 'C', 'A']

    expect(orderByStaleness(symbols, {})).toEqual(['B', 'C', 'A'])
    expect(symbols).toEqual(['B', 'C', 'A'])
  })
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
    expect(loadPriceCache()).toEqual({ 'SAP.DEX': { fetchedAt: TODAY, from: FROM, series: freshSeries } })
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

  it('spends a limited quota on the stalest symbol first, not the alphabetically first', async () => {
    savePriceCache({
      AAA: { fetchedAt: '2026-02-28', series: [{ date: '2026-02-27', close: 1 }] },
      ZZZ: { fetchedAt: '2026-02-20', series: [{ date: '2026-02-13', close: 2 }] },
    })
    fetchWeeklyMock
      .mockResolvedValueOnce(freshSeries)
      .mockRejectedValueOnce(new RateLimitError('limit'))

    const result = await getSeries(['AAA', 'ZZZ'], 'demo-key', TODAY)

    expect(result.series.ZZZ).toEqual(freshSeries)
    expect(result.rateLimited).toEqual(['AAA'])
    expect(result.series.AAA).toEqual([{ date: '2026-02-27', close: 1 }])
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

    expect(loadPriceCache()).toEqual({ BOGUS: { fetchedAt: TODAY, from: FROM, series: [], failed: true } })
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

describe('getSeries with onvista as the primary source', () => {
  it('loads stocks from onvista without touching Alpha Vantage', async () => {
    fetchDailyHistoryMock.mockResolvedValue(dailySeries)

    const result = await getSeries(['SAP.DEX'], 'demo-key', TODAY)

    expect(result.series['SAP.DEX']).toEqual(dailySeries)
    expect(fetchDailyHistoryMock).toHaveBeenCalledWith('DE0007164600', 'stock', FROM)
    expect(fetchWeeklyMock).not.toHaveBeenCalled()
    expect(loadPriceCache()['SAP.DEX']).toEqual({ fetchedAt: TODAY, from: FROM, series: dailySeries })
  })

  it('works without an API key', async () => {
    fetchDailyHistoryMock.mockResolvedValue(dailySeries)

    const result = await getSeries(['SAP.DEX'], undefined, TODAY)

    expect(result.series['SAP.DEX']).toEqual(dailySeries)
  })

  it('starts one year before the symbol\'s first date and uses the FUND type for ETFs', async () => {
    fetchDailyHistoryMock.mockResolvedValue(dailySeries)

    await getSeries(['EUNL.DEX'], undefined, TODAY, {
      'EUNL.DEX': { kind: 'etf', isin: 'IE00B4L5Y983', since: '2024-06-15' },
    })

    expect(lookupIsinMock).not.toHaveBeenCalled() // ISIN came with the hint
    expect(fetchDailyHistoryMock).toHaveBeenCalledWith('IE00B4L5Y983', 'etf', '2023-06-15')
  })

  it('remembers an ISIN found through the onvista search', async () => {
    fetchDailyHistoryMock.mockResolvedValue(dailySeries)

    await getSeries(['SAP.DEX'], undefined, TODAY)

    expect(loadIsinCache()).toEqual({ 'SAP.DEX': 'DE0007164600' })
  })

  it('refetches when a caller now needs earlier data than the cached series covers', async () => {
    savePriceCache({ 'SAP.DEX': { fetchedAt: TODAY, from: '2025-03-01', series: dailySeries } })
    fetchDailyHistoryMock.mockResolvedValue(dailySeries)

    await getSeries(['SAP.DEX'], undefined, TODAY, { 'SAP.DEX': { kind: 'stock', since: '2020-01-01' } })

    expect(fetchDailyHistoryMock).toHaveBeenCalledWith('DE0007164600', 'stock', '2019-01-01')
  })

  it('falls back to Alpha Vantage when onvista fails and a key exists', async () => {
    fetchWeeklyMock.mockResolvedValue(freshSeries)

    const result = await getSeries(['SAP.DEX'], 'demo-key', TODAY)

    expect(result.series['SAP.DEX']).toEqual(freshSeries)
    expect(fetchWeeklyMock).toHaveBeenCalledOnce()
  })

  it('falls back to Alpha Vantage when onvista does not know the symbol', async () => {
    lookupIsinMock.mockResolvedValue(null)
    fetchWeeklyMock.mockResolvedValue(freshSeries)

    const result = await getSeries(['SAP.DEX'], 'demo-key', TODAY)

    expect(result.series['SAP.DEX']).toEqual(freshSeries)
  })

  it('reports an unknown symbol as failed when there is neither an ISIN nor an API key', async () => {
    lookupIsinMock.mockResolvedValue(null)

    const result = await getSeries(['BOGUS'], undefined, TODAY)

    expect(result.failed).toEqual(['BOGUS'])
  })

  it('reports an onvista outage as unavailable, keeps the stale series and does not poison the cache', async () => {
    const stale = { fetchedAt: '2026-02-20', from: FROM, series: [{ date: '2026-02-19', close: 99 }] }
    savePriceCache({ 'SAP.DEX': stale })

    const result = await getSeries(['SAP.DEX'], undefined, TODAY)

    expect(result.unavailable).toEqual(['SAP.DEX'])
    expect(result.failed).toEqual([])
    expect(result.series['SAP.DEX']).toEqual(stale.series)
    expect(loadPriceCache()['SAP.DEX']).toEqual(stale)
  })

  it('keeps using onvista for other symbols after Alpha Vantage hits its limit', async () => {
    fetchDailyHistoryMock.mockRejectedValueOnce(new Error('onvista down')).mockResolvedValue(dailySeries)
    fetchWeeklyMock.mockRejectedValue(new RateLimitError('limit'))

    const result = await getSeries(['AAA', 'BBB'], 'demo-key', TODAY)

    expect(result.rateLimited).toEqual(['AAA'])
    expect(result.series.BBB).toEqual(dailySeries)
  })
})

describe('getSeries with precious metals', () => {
  const rates: PricePoint[] = [
    { date: '2026-02-20', close: 0.8 },
    { date: '2026-02-27', close: 0.9 },
  ]

  it('converts each history point with the ECB rate of its own day', async () => {
    fetchUsdEurSeriesMock.mockResolvedValue(rates)
    fetchMetalWeeklyMock.mockResolvedValue([
      { date: '2026-02-23', close: 4000 }, // 0.8 applies (last rate on or before)
      { date: '2026-02-27', close: 4000 },
    ])

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.series.XAU).toEqual([
      { date: '2026-02-23', close: 3200 },
      { date: '2026-02-27', close: 3600 },
    ])
    expect(fetchUsdEurSeriesMock).toHaveBeenCalledWith(FROM, TODAY)
  })

  it('appends the live spot price as today\'s point', async () => {
    fetchUsdEurSeriesMock.mockResolvedValue(rates)
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])
    fetchSpotUsdMock.mockResolvedValue(5000)

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.series.XAU).toEqual([
      { date: '2026-02-27', close: 3600 },
      { date: TODAY, close: 4500 },
    ])
  })

  it('still works without an API key, showing the spot price only', async () => {
    fetchUsdEurSeriesMock.mockResolvedValue(rates)
    fetchSpotUsdMock.mockResolvedValue(5000)

    const result = await getSeries(['XAU'], undefined, TODAY)

    expect(fetchMetalWeeklyMock).not.toHaveBeenCalled()
    expect(result.series.XAU).toEqual([{ date: TODAY, close: 4500 }])
  })

  it('is unavailable (not failed) when there is no history and no spot price', async () => {
    fetchUsdEurSeriesMock.mockResolvedValue(rates)

    const result = await getSeries(['XAU'], undefined, TODAY)

    expect(result.unavailable).toEqual(['XAU'])
    expect(result.failed).toEqual([])
  })

  it('is unavailable when Frankfurter does not answer, without spending an Alpha Vantage request', async () => {
    fetchUsdEurSeriesMock.mockRejectedValue(new Error('down'))

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.unavailable).toEqual(['XAU'])
    expect(fetchMetalWeeklyMock).not.toHaveBeenCalled()
  })

  it('fetches the USD/EUR series once for gold and silver and caches it out of sight', async () => {
    fetchUsdEurSeriesMock.mockResolvedValue(rates)
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    const result = await getSeries(['XAU', 'XAG'], 'demo-key', TODAY)

    expect(fetchUsdEurSeriesMock).toHaveBeenCalledOnce()
    expect(result.series['FX:USDEUR']).toBeUndefined()
    expect(loadPriceCache()['FX:USDEUR']).toEqual({ fetchedAt: TODAY, from: FROM, series: rates })
  })

  it('reuses a USD/EUR series cached today', async () => {
    savePriceCache({ 'FX:USDEUR': { fetchedAt: TODAY, from: FROM, series: [{ date: '2026-02-20', close: 0.5 }] } })
    fetchMetalWeeklyMock.mockResolvedValue([{ date: '2026-02-27', close: 4000 }])

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(fetchUsdEurSeriesMock).not.toHaveBeenCalled()
    expect(result.series.XAU).toEqual([{ date: '2026-02-27', close: 2000 }])
  })

  it('marks the metal as rate-limited and serves its cached series when Alpha Vantage is limited', async () => {
    fetchUsdEurSeriesMock.mockResolvedValue(rates)
    fetchMetalWeeklyMock.mockRejectedValue(new RateLimitError('limit'))
    savePriceCache({ XAU: { fetchedAt: '2026-02-20', from: FROM, series: [{ date: '2026-02-13', close: 3000 }] } })

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.rateLimited).toEqual(['XAU'])
    expect(result.series.XAU).toEqual([{ date: '2026-02-13', close: 3000 }])
  })

  it('marks a metal as failed when Alpha Vantage rejects it for another reason', async () => {
    fetchUsdEurSeriesMock.mockResolvedValue(rates)
    fetchMetalWeeklyMock.mockRejectedValue(new UnknownSymbolError('nope'))

    const result = await getSeries(['XAU'], 'demo-key', TODAY)

    expect(result.failed).toEqual(['XAU'])
    expect(loadPriceCache().XAU).toEqual({ fetchedAt: TODAY, from: FROM, series: [], failed: true })
  })

  it('drops the obsolete single-rate EURUSD cache entry', async () => {
    savePriceCache({ EURUSD: { fetchedAt: TODAY, series: [{ date: TODAY, close: 0.9 }] } })
    fetchDailyHistoryMock.mockResolvedValue(dailySeries)

    await getSeries(['SAP.DEX'], undefined, TODAY)

    expect(loadPriceCache().EURUSD).toBeUndefined()
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
