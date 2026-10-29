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

export interface HistoryPoint {
  date: IsoDate
  /** Market value of all open positions on this date. */
  value: number
  /** Total cost basis of all open positions on this date. */
  invested: number
}
