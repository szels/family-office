import type { InstrumentKind, IsoDate, PricePoint } from '../domain/types'

const BASE_URL = 'https://api.onvista.de/api/v1/instruments/query'

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/
const WKN_PATTERN = /^[A-Z0-9]{6}$/

/**
 * Trims and uppercases `raw`, then checks it against the ISIN and WKN
 * shapes. Returns `null` for anything else so the form can reject it
 * without spending a request on onvista's search.
 */
export function normalizeIdentifier(raw: string): string | null {
  const value = raw.trim().toUpperCase()
  if (ISIN_PATTERN.test(value) || WKN_PATTERN.test(value)) return value
  return null
}

export interface SecurityMatch {
  /** Alpha-Vantage-style symbol, e.g. "EUNL.DEX". */
  symbol: string
  name: string
  isin: string
  wkn: string
  kind: InstrumentKind
}

interface OnvistaListItem {
  entityType?: string
  name?: string
  isin?: string
  wkn?: string
  symbol?: string
}

interface OnvistaResponse {
  list?: OnvistaListItem[]
}

function toKind(entityType: string | undefined): InstrumentKind | null {
  if (entityType === 'STOCK') return 'stock'
  if (entityType === 'FUND') return 'etf'
  return null
}

/**
 * Looks up a security by ISIN or WKN via onvista's (undocumented, but
 * CORS-enabled and keyless) instrument search, since Alpha Vantage's own
 * `SYMBOL_SEARCH` only matches on name/ticker, not ISIN/WKN.
 */
export async function searchSecurity(query: string): Promise<SecurityMatch[]> {
  const url = `${BASE_URL}?${new URLSearchParams({ searchValue: query }).toString()}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Suche fehlgeschlagen: onvista hat nicht geantwortet.')
  }
  const data = (await response.json()) as OnvistaResponse

  const matches: SecurityMatch[] = []
  for (const item of data.list ?? []) {
    const kind = toKind(item.entityType)
    if (!kind || !item.symbol || !item.isin || !item.wkn || !item.name) continue
    matches.push({ symbol: `${item.symbol}.DEX`, name: item.name, isin: item.isin, wkn: item.wkn, kind })
  }
  return matches
}

interface OnvistaHistoryResponse {
  /** Unix seconds, one per trading day. */
  datetimeLast?: number[]
  /** Closing price per entry in `datetimeLast`. */
  last?: number[]
  isoCurrency?: string
}

function unixToIso(seconds: number): IsoDate {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

/**
 * Fetches daily closing prices (EUR, Xetra) for `isin` from `startDate` up to
 * today, ascending by date. Throws when onvista doesn't answer or knows no
 * prices for the instrument, so the caller can fall back to another source.
 */
export async function fetchDailyHistory(
  isin: string,
  kind: InstrumentKind,
  startDate: IsoDate,
): Promise<PricePoint[]> {
  const entityType = kind === 'etf' ? 'FUND' : 'STOCK'
  const params = new URLSearchParams({ range: 'MAX', startDate })
  const response = await fetch(`https://api.onvista.de/api/v1/instruments/${entityType}/ISIN:${isin}/eod_history?${params}`)
  if (!response.ok) {
    throw new Error(`Kursverlauf fehlgeschlagen: onvista antwortete mit ${response.status}.`)
  }

  const data = (await response.json()) as OnvistaHistoryResponse
  const times = data.datetimeLast ?? []
  const closes = data.last ?? []
  const points: PricePoint[] = []
  for (let i = 0; i < times.length; i++) {
    if (Number.isFinite(closes[i])) points.push({ date: unixToIso(times[i]), close: closes[i] })
  }
  if (points.length === 0) {
    throw new Error(`onvista kennt keine Kurse für ${isin}.`)
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

/** Finds the ISIN behind an Alpha-Vantage-style `symbol` (e.g. "SAP.DEX"), or `null` if onvista has no exact match. */
export async function lookupIsin(symbol: string): Promise<string | null> {
  const stem = symbol.replace(/\.DEX$/, '')
  const matches = await searchSecurity(stem)
  return matches.find((match) => match.symbol === symbol)?.isin ?? null
}
