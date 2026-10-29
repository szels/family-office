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
})
