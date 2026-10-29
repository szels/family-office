import type { Instrument, PriceCache, Settings, Transaction } from '../domain/types'

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

interface ExportedData {
  transactions: Transaction[]
  instruments: Record<string, Instrument>
}

/** Serializes transactions and instruments (not settings or the price cache) as JSON. */
export function exportData(): string {
  const data: ExportedData = {
    transactions: loadTransactions(),
    instruments: loadInstruments(),
  }
  return JSON.stringify(data, null, 2)
}

/** Parses and validates previously exported JSON, then overwrites local storage with it. */
export function importData(json: string): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Import fehlgeschlagen: Datei ist kein gültiges JSON.')
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Partial<ExportedData>).transactions) ||
    typeof (parsed as Partial<ExportedData>).instruments !== 'object' ||
    (parsed as Partial<ExportedData>).instruments === null
  ) {
    throw new Error(
      'Import fehlgeschlagen: Datei enthält nicht die erwarteten Felder "transactions" und "instruments".',
    )
  }

  const data = parsed as ExportedData
  saveTransactions(data.transactions)
  saveInstruments(data.instruments)
}
