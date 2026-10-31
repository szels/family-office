import { computePositions } from '../domain/portfolio'
import type { Instrument, PriceCache, Settings, Transaction, WatchlistEntry } from '../domain/types'

const PREFIX = 'pf.v1.'

function load<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(PREFIX + key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

export function loadTransactions(): Transaction[] {
  return load('transactions', [])
}

export function saveTransactions(transactions: Transaction[]): void {
  save('transactions', transactions)
}

export function loadInstruments(): Record<string, Instrument> {
  return load('instruments', {})
}

export function saveInstruments(instruments: Record<string, Instrument>): void {
  save('instruments', instruments)
}

export function loadSettings(): Settings {
  return load('settings', {})
}

export function saveSettings(settings: Settings): void {
  save('settings', settings)
}

export function loadPriceCache(): PriceCache {
  return load('prices', {})
}

export function savePriceCache(cache: PriceCache): void {
  save('prices', cache)
}

export function loadWatchlist(): WatchlistEntry[] {
  return load('watchlist', [])
}

export function saveWatchlist(watchlist: WatchlistEntry[]): void {
  save('watchlist', watchlist)
}

interface ExportedData {
  transactions: Transaction[]
  instruments: Record<string, Instrument>
  watchlist: WatchlistEntry[]
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidTransaction(value: unknown): value is Transaction {
  if (typeof value !== 'object' || value === null) return false
  const tx = value as Record<string, unknown>
  return (
    typeof tx.id === 'string' &&
    tx.id !== '' &&
    (tx.type === 'buy' || tx.type === 'sell') &&
    typeof tx.symbol === 'string' &&
    tx.symbol !== '' &&
    typeof tx.date === 'string' &&
    ISO_DATE.test(tx.date) &&
    typeof tx.quantity === 'number' &&
    Number.isFinite(tx.quantity) &&
    tx.quantity > 0 &&
    typeof tx.price === 'number' &&
    Number.isFinite(tx.price) &&
    tx.price > 0 &&
    typeof tx.fees === 'number' &&
    Number.isFinite(tx.fees) &&
    tx.fees >= 0
  )
}

function isValidInstrument(value: unknown): value is Instrument {
  if (typeof value !== 'object' || value === null) return false
  const instrument = value as Record<string, unknown>
  return typeof instrument.name === 'string' && (instrument.kind === 'stock' || instrument.kind === 'etf')
}

function isValidWatchlistEntry(value: unknown): value is WatchlistEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.symbol === 'string' &&
    entry.symbol !== '' &&
    typeof entry.name === 'string' &&
    typeof entry.isin === 'string' &&
    typeof entry.wkn === 'string' &&
    (entry.kind === 'stock' || entry.kind === 'etf') &&
    typeof entry.addedAt === 'string' &&
    ISO_DATE.test(entry.addedAt)
  )
}

/** Serializes transactions, instruments and the watchlist (not settings or the price cache) as JSON. */
export function exportData(): string {
  const data: ExportedData = {
    transactions: loadTransactions(),
    instruments: loadInstruments(),
    watchlist: loadWatchlist(),
  }
  return JSON.stringify(data, null, 2)
}

/**
 * Parses and validates previously exported JSON, then overwrites local
 * storage with it. Validates everything — shape, every transaction, every
 * instrument, duplicate ids, and finally a `computePositions` dry run to
 * catch internally inconsistent data (e.g. a sell with no matching buy) —
 * before writing anything, so a rejected import never partially overwrites
 * what was there.
 */
export function importData(json: string): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Import fehlgeschlagen: Datei ist kein gültiges JSON.')
  }

  const candidate = parsed as Partial<ExportedData> | null
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !Array.isArray(candidate.transactions) ||
    typeof candidate.instruments !== 'object' ||
    candidate.instruments === null ||
    Array.isArray(candidate.instruments)
  ) {
    throw new Error(
      'Import fehlgeschlagen: Datei enthält nicht die erwarteten Felder "transactions" und "instruments".',
    )
  }

  const { transactions, instruments } = candidate
  // Older exports predate the watchlist field — treat a missing one as empty
  // rather than rejecting the whole import.
  const watchlist = candidate.watchlist ?? []

  if (!transactions.every(isValidTransaction)) {
    throw new Error('Import fehlgeschlagen: eine oder mehrere Transaktionen haben ein ungültiges Format.')
  }
  if (!Object.values(instruments).every(isValidInstrument)) {
    throw new Error('Import fehlgeschlagen: ein oder mehrere Wertpapiere haben ein ungültiges Format.')
  }
  if (!Array.isArray(watchlist) || !watchlist.every(isValidWatchlistEntry)) {
    throw new Error('Import fehlgeschlagen: ein oder mehrere Watchlist-Einträge haben ein ungültiges Format.')
  }

  const seenIds = new Set<string>()
  for (const tx of transactions) {
    if (seenIds.has(tx.id)) {
      throw new Error(`Import fehlgeschlagen: doppelte Transaktions-ID "${tx.id}".`)
    }
    seenIds.add(tx.id)
  }

  try {
    computePositions(transactions, {})
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unbekannter Fehler'
    throw new Error(`Import fehlgeschlagen: Die Transaktionen sind nicht stimmig (${reason}).`)
  }

  saveTransactions(transactions)
  saveInstruments(instruments)
  saveWatchlist(watchlist)
}
