import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError, UnknownSymbolError } from './alphaVantage'
import { getSeries } from './priceCache'
import { loadPriceCache, savePriceCache } from './storage'
import type { PricePoint } from '../domain/types'

vi.mock('./alphaVantage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./alphaVantage')>()
  return { ...actual, fetchWeekly: vi.fn() }
})

const { fetchWeekly } = await import('./alphaVantage')
const fetchWeeklyMock = vi.mocked(fetchWeekly)

const TODAY = '2026-03-01'
const freshSeries: PricePoint[] = [{ date: '2026-02-27', close: 123 }]

beforeEach(() => {
  localStorage.clear()
  fetchWeeklyMock.mockReset()
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
})
