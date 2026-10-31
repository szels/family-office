/** ISO date string, e.g. "2026-03-15". */
export type IsoDate = string

export type TransactionType = 'buy' | 'sell'

export interface Transaction {
  id: string
  type: TransactionType
  symbol: string
  date: IsoDate
  quantity: number
  /** Price per share/unit in EUR, excluding fees. */
  price: number
  /** Order fees in EUR, default 0. */
  fees: number
}

export type InstrumentKind = 'stock' | 'etf'

export interface Instrument {
  name: string
  kind: InstrumentKind
}

/** A single closing price on a given date, used for historical series. */
export interface PricePoint {
  date: IsoDate
  close: number
}

export interface Position {
  symbol: string
  quantity: number
  /** Total cost basis (average-cost method), including fees, in EUR. */
  costBasis: number
  /** costBasis / quantity. */
  avgCost: number
  currentPrice: number
  marketValue: number
  /** marketValue - costBasis. */
  gainAbs: number
  /** gainAbs / costBasis, as a fraction (0.1 = 10%). */
  gainPct: number
  /** Realized gain/loss from sells of this symbol, average-cost method. */
  realizedGain: number
}

export interface WatchlistEntry {
  /** Alpha-Vantage-Symbol, z. B. "EUNL.DEX". */
  symbol: string
  name: string
  isin: string
  wkn: string
  kind: InstrumentKind
  addedAt: IsoDate
}

export interface HistoryPoint {
  date: IsoDate
  /** Market value of all open positions on this date. */
  value: number
  /** Total cost basis of all open positions on this date. */
  invested: number
}

export interface Settings {
  apiKey?: string
}

export interface PriceCacheEntry {
  /** Date the series was last fetched; used to avoid refetching same-day. */
  fetchedAt: IsoDate
  /** Ascending by date. */
  series: PricePoint[]
  /**
   * Set when the fetch on `fetchedAt` failed for a reason other than the
   * rate limit (e.g. an unknown symbol) — skip it for the rest of that day
   * rather than spending another of the 25 daily requests on it.
   */
  failed?: boolean
}

export type PriceCache = Record<string, PriceCacheEntry>
