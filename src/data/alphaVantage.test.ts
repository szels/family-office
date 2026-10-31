import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchMetalWeekly,
  fetchUsdEurRate,
  fetchWeekly,
  RateLimitError,
  searchSymbol,
  UnknownSymbolError,
} from './alphaVantage'

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

describe('fetchMetalWeekly', () => {
  it('parses the gold/silver history into ascending price points', async () => {
    mockFetchOnce({
      nominal: 'XAUUSD',
      data: [
        { date: '2026-10-30', price: '3998.5892976958' },
        { date: '2026-10-25', price: '3995.8586920516' },
      ],
    })

    const points = await fetchMetalWeekly('XAU', 'demo-key')

    expect(points).toEqual([
      { date: '2026-10-25', close: 3995.8586920516 },
      { date: '2026-10-30', close: 3998.5892976958 },
    ])
  })

  it('requests GOLD_SILVER_HISTORY with the symbol, weekly interval and key', async () => {
    mockFetchOnce({ nominal: 'XAUUSD', data: [] })

    await fetchMetalWeekly('XAU', 'demo-key')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('function=GOLD_SILVER_HISTORY&symbol=XAU&interval=weekly&apikey=demo-key'),
    )
  })

  it('throws RateLimitError on a "Note" response', async () => {
    mockFetchOnce({ Note: 'standard API rate limit is 25 requests per day' })

    await expect(fetchMetalWeekly('XAU', 'demo-key')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('throws UnknownSymbolError when the data key is simply missing', async () => {
    mockFetchOnce({})

    await expect(fetchMetalWeekly('XAU', 'demo-key')).rejects.toBeInstanceOf(UnknownSymbolError)
  })
})

describe('fetchUsdEurRate', () => {
  it('parses the exchange rate field', async () => {
    mockFetchOnce({
      'Realtime Currency Exchange Rate': {
        '1. From_Currency Code': 'USD',
        '3. To_Currency Code': 'EUR',
        '5. Exchange Rate': '0.89563964',
      },
    })

    expect(await fetchUsdEurRate('demo-key')).toBeCloseTo(0.89563964)
  })

  it('requests CURRENCY_EXCHANGE_RATE with USD/EUR and the key', async () => {
    mockFetchOnce({ 'Realtime Currency Exchange Rate': { '5. Exchange Rate': '0.9' } })

    await fetchUsdEurRate('demo-key')

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=EUR&apikey=demo-key',
      ),
    )
  })

  it('throws RateLimitError on a "Note" response', async () => {
    mockFetchOnce({ Note: 'standard API rate limit is 25 requests per day' })

    await expect(fetchUsdEurRate('demo-key')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('throws an error when the rate field is simply missing', async () => {
    mockFetchOnce({})

    await expect(fetchUsdEurRate('demo-key')).rejects.toThrow()
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
