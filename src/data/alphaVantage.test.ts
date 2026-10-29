import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWeekly, RateLimitError, searchSymbol, UnknownSymbolError } from './alphaVantage'

function mockFetchOnce(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchWeekly', () => {
  it('parses the weekly series into ascending price points', async () => {
    mockFetchOnce({
      'Weekly Time Series': {
        '2026-02-27': { '4. close': '123.45' },
        '2026-02-20': { '4. close': '120.00' },
      },
    })

    const points = await fetchWeekly('SAP.DEX', 'demo-key')

    expect(points).toEqual([
      { date: '2026-02-20', close: 120 },
      { date: '2026-02-27', close: 123.45 },
    ])
  })

  it('requests the TIME_SERIES_WEEKLY function with the symbol and key', async () => {
    mockFetchOnce({ 'Weekly Time Series': {} })

    await fetchWeekly('SAP.DEX', 'demo-key')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('function=TIME_SERIES_WEEKLY&symbol=SAP.DEX&apikey=demo-key'),
    )
  })

  it('throws RateLimitError on a "Note" response', async () => {
    mockFetchOnce({ Note: 'standard API rate limit is 25 requests per day' })

    await expect(fetchWeekly('SAP.DEX', 'demo-key')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('throws RateLimitError on an "Information" response', async () => {
    mockFetchOnce({ Information: 'Thank you for using Alpha Vantage, please upgrade...' })

    await expect(fetchWeekly('SAP.DEX', 'demo-key')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('throws UnknownSymbolError on an "Error Message" response', async () => {
    mockFetchOnce({ 'Error Message': 'Invalid API call.' })

    await expect(fetchWeekly('UNKNOWN', 'demo-key')).rejects.toBeInstanceOf(UnknownSymbolError)
  })

  it('throws UnknownSymbolError when the series key is simply missing', async () => {
    mockFetchOnce({})

    await expect(fetchWeekly('UNKNOWN', 'demo-key')).rejects.toBeInstanceOf(UnknownSymbolError)
  })
})

describe('searchSymbol', () => {
  it('maps best matches to symbol/name/currency', async () => {
    mockFetchOnce({
      bestMatches: [
        { '1. symbol': 'SAP.DEX', '2. name': 'SAP SE', '8. currency': 'EUR' },
        { '1. symbol': 'SAP', '2. name': 'SAP SE', '8. currency': 'USD' },
      ],
    })

    const matches = await searchSymbol('SAP', 'demo-key')

    expect(matches).toEqual([
      { symbol: 'SAP.DEX', name: 'SAP SE', currency: 'EUR' },
      { symbol: 'SAP', name: 'SAP SE', currency: 'USD' },
    ])
  })

  it('returns an empty array when there are no matches', async () => {
    mockFetchOnce({ bestMatches: [] })

    expect(await searchSymbol('xyz', 'demo-key')).toEqual([])
  })

  it('throws RateLimitError when the search itself is rate-limited', async () => {
    mockFetchOnce({ Note: 'rate limit' })

    await expect(searchSymbol('SAP', 'demo-key')).rejects.toBeInstanceOf(RateLimitError)
  })
})
