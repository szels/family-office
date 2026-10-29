import type { PricePoint } from '../domain/types'

const BASE_URL = 'https://www.alphavantage.co/query'

/** The API answers with HTTP 200 even when the daily/per-minute quota is used up. */
export class RateLimitError extends Error {}

/** The API answers with HTTP 200 even for a symbol it doesn't recognize. */
export class UnknownSymbolError extends Error {}

interface AlphaVantageResponse {
  Note?: string
  Information?: string
  'Error Message'?: string
  'Weekly Time Series'?: Record<string, { '4. close': string }>
  bestMatches?: Array<Record<string, string>>
}

function assertNoApiError(data: AlphaVantageResponse): void {
  if (data.Note !== undefined || data.Information !== undefined) {
    throw new RateLimitError(data.Note ?? data.Information ?? 'Alpha Vantage rate limit reached')
  }
  if (data['Error Message'] !== undefined) {
    throw new UnknownSymbolError(data['Error Message'])
  }
}

async function callApi(params: Record<string, string>): Promise<AlphaVantageResponse> {
  const url = `${BASE_URL}?${new URLSearchParams(params).toString()}`
  const response = await fetch(url)
  return (await response.json()) as AlphaVantageResponse
}

/** Fetches weekly closing prices for `symbol`, ascending by date. */
export async function fetchWeekly(symbol: string, apiKey: string): Promise<PricePoint[]> {
  const data = await callApi({ function: 'TIME_SERIES_WEEKLY', symbol, apikey: apiKey })
  assertNoApiError(data)

  const series = data['Weekly Time Series']
  if (!series) {
    throw new UnknownSymbolError(`Keine Kursdaten für Symbol "${symbol}" gefunden.`)
  }

  return Object.entries(series)
    .map(([date, values]) => ({ date, close: Number.parseFloat(values['4. close']) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface SymbolMatch {
  symbol: string
  name: string
  currency: string
}

/** Looks up symbols matching a free-text query (company name, ISIN, ticker fragment). */
export async function searchSymbol(query: string, apiKey: string): Promise<SymbolMatch[]> {
  const data = await callApi({ function: 'SYMBOL_SEARCH', keywords: query, apikey: apiKey })
  assertNoApiError(data)

  return (data.bestMatches ?? []).map((match) => ({
    symbol: match['1. symbol'],
    name: match['2. name'],
    currency: match['8. currency'],
  }))
}
