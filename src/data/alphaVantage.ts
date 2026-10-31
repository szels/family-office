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
  /** GOLD_SILVER_HISTORY. */
  data?: Array<{ date: string; price: string }>
  /** CURRENCY_EXCHANGE_RATE. */
  'Realtime Currency Exchange Rate'?: Record<string, string>
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

export const METAL_SYMBOLS = ['XAU', 'XAG'] as const
export type MetalSymbol = (typeof METAL_SYMBOLS)[number]

export function isMetalSymbol(symbol: string): symbol is MetalSymbol {
  return (METAL_SYMBOLS as readonly string[]).includes(symbol)
}

/** Fetches weekly gold ('XAU') or silver ('XAG') prices in USD per troy ounce, ascending by date. */
export async function fetchMetalWeekly(symbol: MetalSymbol, apiKey: string): Promise<PricePoint[]> {
  const data = await callApi({ function: 'GOLD_SILVER_HISTORY', symbol, interval: 'weekly', apikey: apiKey })
  assertNoApiError(data)

  if (!data.data) {
    throw new UnknownSymbolError(`Keine Kursdaten für Edelmetall "${symbol}" gefunden.`)
  }

  return data.data
    .map((point) => ({ date: point.date, close: Number.parseFloat(point.price) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Fetches the current USD→EUR exchange rate (1 USD = x EUR). */
export async function fetchUsdEurRate(apiKey: string): Promise<number> {
  const data = await callApi({
    function: 'CURRENCY_EXCHANGE_RATE',
    from_currency: 'USD',
    to_currency: 'EUR',
    apikey: apiKey,
  })
  assertNoApiError(data)

  const rate = data['Realtime Currency Exchange Rate']?.['5. Exchange Rate']
  if (!rate) {
    throw new Error('Wechselkurs USD/EUR konnte nicht ermittelt werden.')
  }
  return Number.parseFloat(rate)
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
