import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDailyHistory, lookupIsin, normalizeIdentifier, searchSecurity } from './onvista'

function mockFetchOnce(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeIdentifier', () => {
  it('accepts a 12-character ISIN and uppercases it', () => {
    expect(normalizeIdentifier('ie00b4l5y983')).toBe('IE00B4L5Y983')
  })

  it('accepts a 6-character WKN and uppercases it', () => {
    expect(normalizeIdentifier('a0rpwh')).toBe('A0RPWH')
  })

  it('strips surrounding whitespace before checking the shape', () => {
    expect(normalizeIdentifier('  716460  ')).toBe('716460')
  })

  it('rejects anything that is neither ISIN nor WKN shaped', () => {
    expect(normalizeIdentifier('SAP')).toBeNull()
    expect(normalizeIdentifier('')).toBeNull()
  })
})

describe('searchSecurity', () => {
  it('maps stocks and funds to Alpha-Vantage-style .DEX symbols', async () => {
    mockFetchOnce({
      list: [
        {
          entityType: 'FUND',
          name: 'iShares Core MSCI World UCITS ETF USD Acc.',
          isin: 'IE00B4L5Y983',
          wkn: 'A0RPWH',
          symbol: 'EUNL',
        },
      ],
    })

    const matches = await searchSecurity('A0RPWH')

    expect(matches).toEqual([
      {
        symbol: 'EUNL.DEX',
        name: 'iShares Core MSCI World UCITS ETF USD Acc.',
        isin: 'IE00B4L5Y983',
        wkn: 'A0RPWH',
        kind: 'etf',
      },
    ])
  })

  it('maps STOCK entityType to kind "stock"', async () => {
    mockFetchOnce({
      list: [{ entityType: 'STOCK', name: 'SAP SE', isin: 'DE0007164600', wkn: '716460', symbol: 'SAP' }],
    })

    const matches = await searchSecurity('716460')

    expect(matches[0].kind).toBe('stock')
  })

  it('skips entries without a usable symbol, ISIN, WKN or an unsupported type', async () => {
    mockFetchOnce({
      list: [
        { entityType: 'STOCK', name: 'Ohne Symbol', isin: 'DE0007164600', wkn: '716460' },
        { entityType: 'CERTIFICATE', name: 'Zertifikat', isin: 'DE0001234567', wkn: '123456', symbol: 'ZZZ' },
      ],
    })

    const matches = await searchSecurity('irrelevant')

    expect(matches).toEqual([])
  })

  it('returns an empty list when nothing matches', async () => {
    mockFetchOnce({ list: [] })

    expect(await searchSecurity('xyzxyzxyz')).toEqual([])
  })

  it('requests the query endpoint with the search value', async () => {
    mockFetchOnce({ list: [] })

    await searchSecurity('716460')

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('searchValue=716460'))
  })

  it('throws a German error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }))

    await expect(searchSecurity('716460')).rejects.toThrow('Suche fehlgeschlagen')
  })
})

describe('fetchDailyHistory', () => {
  // 1_772_150_400 = 2026-02-27T00:00Z, 1_772_064_000 = 2026-02-26T00:00Z
  const body = { datetimeLast: [1_772_150_400, 1_772_064_000], last: [123, 120], isoCurrency: 'EUR' }

  it('zips timestamps and closes into ascending price points', async () => {
    mockFetchOnce(body)

    expect(await fetchDailyHistory('DE0007164600', 'stock', '2025-03-01')).toEqual([
      { date: '2026-02-26', close: 120 },
      { date: '2026-02-27', close: 123 },
    ])
  })

  it('requests STOCK or FUND by kind, with the whole span from the start date', async () => {
    mockFetchOnce(body)
    await fetchDailyHistory('IE00B4L5Y983', 'etf', '2025-03-01')

    const url = String(vi.mocked(fetch).mock.calls[0][0])
    expect(url).toContain('/instruments/FUND/ISIN:IE00B4L5Y983/eod_history')
    expect(url).toContain('range=MAX')
    expect(url).toContain('startDate=2025-03-01')
  })

  it('throws on a non-OK response so the caller can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))

    await expect(fetchDailyHistory('DE0007164600', 'stock', '2025-03-01')).rejects.toThrow(/429/)
  })

  it('throws when onvista returns no prices', async () => {
    mockFetchOnce({ datetimeLast: [], last: [] })

    await expect(fetchDailyHistory('DE0007164600', 'stock', '2025-03-01')).rejects.toThrow(/keine Kurse/)
  })
})

describe('lookupIsin', () => {
  it('returns the ISIN of the exact symbol match and ignores look-alikes', async () => {
    mockFetchOnce({
      list: [
        { entityType: 'STOCK', name: 'SAP ADR', isin: 'US8030542042', wkn: '884437', symbol: 'SAPG' },
        { entityType: 'STOCK', name: 'SAP SE', isin: 'DE0007164600', wkn: '716460', symbol: 'SAP' },
      ],
    })

    expect(await lookupIsin('SAP.DEX')).toBe('DE0007164600')
  })

  it('returns null when nothing matches exactly', async () => {
    mockFetchOnce({ list: [] })

    expect(await lookupIsin('SAP.DEX')).toBeNull()
  })
})
