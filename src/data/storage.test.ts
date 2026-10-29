import { beforeEach, describe, expect, it } from 'vitest'
import {
  exportData,
  importData,
  loadInstruments,
  loadPriceCache,
  loadSettings,
  loadTransactions,
  saveInstruments,
  savePriceCache,
  saveSettings,
  saveTransactions,
} from './storage'
import type { Instrument, PriceCache, Settings, Transaction } from '../domain/types'

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

describe('export / import', () => {
  it('exports transactions and instruments, but not settings or price cache', () => {
    saveTransactions([transaction])
    saveInstruments(instruments)
    saveSettings({ apiKey: 'secret' })

    const json = exportData()
    const parsed = JSON.parse(json)

    expect(parsed).toEqual({ transactions: [transaction], instruments })
  })

  it('imports previously exported data back into storage', () => {
    const json = JSON.stringify({ transactions: [transaction], instruments })

    importData(json)

    expect(loadTransactions()).toEqual([transaction])
    expect(loadInstruments()).toEqual(instruments)
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
