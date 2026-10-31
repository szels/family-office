import { beforeEach, describe, expect, it } from 'vitest'
import {
  exportData,
  importData,
  loadInstruments,
  loadPriceCache,
  loadSettings,
  loadTransactions,
  loadWatchlist,
  saveInstruments,
  savePriceCache,
  saveSettings,
  saveTransactions,
  saveWatchlist,
} from './storage'
import type { Instrument, PriceCache, Settings, Transaction, WatchlistEntry } from '../domain/types'

const transaction: Transaction = {
  id: 'tx-1',
  type: 'buy',
  symbol: 'SAP.DEX',
  date: '2026-01-10',
  quantity: 10,
  price: 100,
  fees: 0,
}

const instruments: Record<string, Instrument> = {
  'SAP.DEX': { name: 'SAP SE', kind: 'stock' },
}

const watchlistEntry: WatchlistEntry = {
  symbol: 'EUNL.DEX',
  name: 'iShares Core MSCI World UCITS ETF USD Acc.',
  isin: 'IE00B4L5Y983',
  wkn: 'A0RPWH',
  kind: 'etf',
  addedAt: '2026-02-01',
}

beforeEach(() => {
  localStorage.clear()
})

describe('transactions', () => {
  it('defaults to an empty array', () => {
    expect(loadTransactions()).toEqual([])
  })

  it('round-trips through save/load', () => {
    saveTransactions([transaction])
    expect(loadTransactions()).toEqual([transaction])
  })
})

describe('instruments', () => {
  it('defaults to an empty object', () => {
    expect(loadInstruments()).toEqual({})
  })

  it('round-trips through save/load', () => {
    saveInstruments(instruments)
    expect(loadInstruments()).toEqual(instruments)
  })
})

describe('settings', () => {
  it('defaults to an empty object', () => {
    expect(loadSettings()).toEqual({})
  })

  it('round-trips through save/load', () => {
    const settings: Settings = { apiKey: 'demo-key' }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })
})

describe('price cache', () => {
  it('defaults to an empty object', () => {
    expect(loadPriceCache()).toEqual({})
  })

  it('round-trips through save/load', () => {
    const cache: PriceCache = {
      'SAP.DEX': { fetchedAt: '2026-03-01', series: [{ date: '2026-02-01', close: 110 }] },
    }
    savePriceCache(cache)
    expect(loadPriceCache()).toEqual(cache)
  })
})

describe('watchlist', () => {
  it('defaults to an empty array', () => {
    expect(loadWatchlist()).toEqual([])
  })

  it('round-trips through save/load', () => {
    saveWatchlist([watchlistEntry])
    expect(loadWatchlist()).toEqual([watchlistEntry])
  })
})

describe('export / import', () => {
  it('exports transactions, instruments and the watchlist, but not settings or price cache', () => {
    saveTransactions([transaction])
    saveInstruments(instruments)
    saveWatchlist([watchlistEntry])
    saveSettings({ apiKey: 'secret' })

    const json = exportData()
    const parsed = JSON.parse(json)

    expect(parsed).toEqual({ transactions: [transaction], instruments, watchlist: [watchlistEntry] })
  })

  it('imports previously exported data back into storage', () => {
    const json = JSON.stringify({ transactions: [transaction], instruments, watchlist: [watchlistEntry] })

    importData(json)

    expect(loadTransactions()).toEqual([transaction])
    expect(loadInstruments()).toEqual(instruments)
    expect(loadWatchlist()).toEqual([watchlistEntry])
  })

  it('imports older exports that have no watchlist field at all', () => {
    const json = JSON.stringify({ transactions: [transaction], instruments })

    importData(json)

    expect(loadTransactions()).toEqual([transaction])
    expect(loadWatchlist()).toEqual([])
  })

  it('rejects a watchlist entry with an invalid kind', () => {
    const bad = { ...watchlistEntry, kind: 'bond' }
    expect(() =>
      importData(JSON.stringify({ transactions: [], instruments: {}, watchlist: [bad] })),
    ).toThrow()
  })

  it('rejects a watchlist given as an array of non-objects', () => {
    expect(() =>
      importData(JSON.stringify({ transactions: [], instruments: {}, watchlist: ['EUNL.DEX'] })),
    ).toThrow()
  })

  it('rejects malformed JSON', () => {
    expect(() => importData('not json')).toThrow()
  })

  it('rejects valid JSON missing the expected shape', () => {
    expect(() => importData(JSON.stringify({ foo: 'bar' }))).toThrow()
  })

  it('rejects a transaction with an invalid type instead of silently treating it as a sell', () => {
    const bad = { ...transaction, type: 'BUY' } // wrong case — not the literal 'buy'
    expect(() => importData(JSON.stringify({ transactions: [bad], instruments }))).toThrow()
  })

  it('rejects a transaction with a non-numeric quantity', () => {
    const bad = { ...transaction, quantity: '10' }
    expect(() => importData(JSON.stringify({ transactions: [bad], instruments }))).toThrow()
  })

  it('rejects a transaction with a malformed date', () => {
    const bad = { ...transaction, date: '10.01.2026' }
    expect(() => importData(JSON.stringify({ transactions: [bad], instruments }))).toThrow()
  })

  it('rejects duplicate transaction ids', () => {
    const dup = [transaction, { ...transaction, price: 50 }]
    expect(() => importData(JSON.stringify({ transactions: dup, instruments }))).toThrow()
  })

  it('rejects instruments given as an array instead of an object', () => {
    expect(() => importData(JSON.stringify({ transactions: [], instruments: [] }))).toThrow()
  })

  it('rejects internally inconsistent data (a sell with no matching buy) via a dry run', () => {
    const sellOnly = { ...transaction, id: 'tx-sell', type: 'sell' as const }
    expect(() => importData(JSON.stringify({ transactions: [sellOnly], instruments }))).toThrow()
  })

  it('leaves existing data untouched when an import is rejected', () => {
    saveTransactions([transaction])
    saveInstruments(instruments)

    expect(() => importData(JSON.stringify({ foo: 'bar' }))).toThrow()

    expect(loadTransactions()).toEqual([transaction])
    expect(loadInstruments()).toEqual(instruments)
  })
})
