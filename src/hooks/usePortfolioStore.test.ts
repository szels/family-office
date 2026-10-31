import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePortfolioStore } from './usePortfolioStore'
import { loadInstruments, loadPriceCache, loadTransactions, loadWatchlist, savePriceCache } from '../data/storage'
import type { Transaction, WatchlistEntry } from '../domain/types'

const buy: Transaction = {
  id: 'tx-1',
  type: 'buy',
  symbol: 'SAP.DEX',
  date: '2026-01-10',
  quantity: 10,
  price: 100,
  fees: 0,
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

describe('usePortfolioStore', () => {
  it('starts from whatever is already in storage', () => {
    const { result } = renderHook(() => usePortfolioStore())
    expect(result.current.transactions).toEqual([])
    expect(result.current.instruments).toEqual({})
  })

  it('adds a transaction to state and persists it', () => {
    const { result } = renderHook(() => usePortfolioStore())

    act(() => result.current.addTransaction(buy))

    expect(result.current.transactions).toEqual([buy])
    expect(loadTransactions()).toEqual([buy])
  })

  it('removes a transaction by id', () => {
    const { result } = renderHook(() => usePortfolioStore())
    act(() => result.current.addTransaction(buy))

    act(() => result.current.removeTransaction(buy.id))

    expect(result.current.transactions).toEqual([])
    expect(loadTransactions()).toEqual([])
  })

  it('replaces a transaction by id and persists it', () => {
    const { result } = renderHook(() => usePortfolioStore())
    act(() => result.current.addTransaction(buy))

    const edited: Transaction = { ...buy, quantity: 5, price: 150 }
    act(() => result.current.updateTransaction(buy.id, edited))

    expect(result.current.transactions).toEqual([edited])
    expect(loadTransactions()).toEqual([edited])
  })

  it('upserts an instrument and persists it', () => {
    const { result } = renderHook(() => usePortfolioStore())

    act(() => result.current.upsertInstrument('SAP.DEX', { name: 'SAP SE', kind: 'stock' }))

    expect(result.current.instruments).toEqual({ 'SAP.DEX': { name: 'SAP SE', kind: 'stock' } })
    expect(loadInstruments()).toEqual({ 'SAP.DEX': { name: 'SAP SE', kind: 'stock' } })
  })

  it('removes an instrument, leaves others untouched, and drops its price cache entry', () => {
    const { result } = renderHook(() => usePortfolioStore())
    act(() => {
      result.current.upsertInstrument('SAP.DEX', { name: 'SAP SE', kind: 'stock' })
      result.current.upsertInstrument('EUNL.DEX', { name: 'iShares Core MSCI World', kind: 'etf' })
    })
    savePriceCache({
      'SAP.DEX': { fetchedAt: '2026-01-10', series: [] },
      'EUNL.DEX': { fetchedAt: '2026-01-10', series: [] },
    })

    act(() => result.current.removeInstrument('SAP.DEX'))

    expect(result.current.instruments).toEqual({ 'EUNL.DEX': { name: 'iShares Core MSCI World', kind: 'etf' } })
    expect(loadInstruments()).toEqual({ 'EUNL.DEX': { name: 'iShares Core MSCI World', kind: 'etf' } })
    expect(loadPriceCache()).toEqual({ 'EUNL.DEX': { fetchedAt: '2026-01-10', series: [] } })
  })

  it('keeps the price cache when removing an instrument whose symbol is still on the watchlist', () => {
    const { result } = renderHook(() => usePortfolioStore())
    act(() => {
      result.current.upsertInstrument('EUNL.DEX', { name: 'iShares Core MSCI World', kind: 'etf' })
      result.current.addToWatchlist(watchlistEntry)
    })
    savePriceCache({ 'EUNL.DEX': { fetchedAt: '2026-02-01', series: [] } })

    act(() => result.current.removeInstrument('EUNL.DEX'))

    expect(loadPriceCache()).toEqual({ 'EUNL.DEX': { fetchedAt: '2026-02-01', series: [] } })
  })

  it('updates the API key in settings', () => {
    const { result } = renderHook(() => usePortfolioStore())

    act(() => result.current.updateApiKey('demo-key'))

    expect(result.current.settings.apiKey).toBe('demo-key')
  })

  it('imports transactions and instruments, replacing state', () => {
    const { result } = renderHook(() => usePortfolioStore())
    const json = JSON.stringify({
      transactions: [buy],
      instruments: { 'SAP.DEX': { name: 'SAP SE', kind: 'stock' } },
    })

    act(() => result.current.importAll(json))

    expect(result.current.transactions).toEqual([buy])
    expect(result.current.instruments).toEqual({ 'SAP.DEX': { name: 'SAP SE', kind: 'stock' } })
  })

  it('starts with the watchlist already in storage', () => {
    const { result } = renderHook(() => usePortfolioStore())
    expect(result.current.watchlist).toEqual([])
  })

  it('adds an entry to the watchlist and persists it', () => {
    const { result } = renderHook(() => usePortfolioStore())

    act(() => result.current.addToWatchlist(watchlistEntry))

    expect(result.current.watchlist).toEqual([watchlistEntry])
    expect(loadWatchlist()).toEqual([watchlistEntry])
  })

  it('ignores adding a symbol that is already on the watchlist', () => {
    const { result } = renderHook(() => usePortfolioStore())
    act(() => result.current.addToWatchlist(watchlistEntry))

    act(() => result.current.addToWatchlist({ ...watchlistEntry, name: 'Different name' }))

    expect(result.current.watchlist).toEqual([watchlistEntry])
  })

  it('removes a watchlist entry and drops its price cache entry', () => {
    const { result } = renderHook(() => usePortfolioStore())
    act(() => result.current.addToWatchlist(watchlistEntry))
    savePriceCache({ 'EUNL.DEX': { fetchedAt: '2026-02-01', series: [] } })

    act(() => result.current.removeFromWatchlist('EUNL.DEX'))

    expect(result.current.watchlist).toEqual([])
    expect(loadWatchlist()).toEqual([])
    expect(loadPriceCache()).toEqual({})
  })

  it('keeps the price cache when removing a watchlist entry whose symbol is still an instrument', () => {
    const { result } = renderHook(() => usePortfolioStore())
    act(() => {
      result.current.addToWatchlist(watchlistEntry)
      result.current.upsertInstrument('EUNL.DEX', { name: 'iShares Core MSCI World', kind: 'etf' })
    })
    savePriceCache({ 'EUNL.DEX': { fetchedAt: '2026-02-01', series: [] } })

    act(() => result.current.removeFromWatchlist('EUNL.DEX'))

    expect(result.current.watchlist).toEqual([])
    expect(loadPriceCache()).toEqual({ 'EUNL.DEX': { fetchedAt: '2026-02-01', series: [] } })
  })

  it('imports the watchlist, replacing state', () => {
    const { result } = renderHook(() => usePortfolioStore())
    const json = JSON.stringify({ transactions: [], instruments: {}, watchlist: [watchlistEntry] })

    act(() => result.current.importAll(json))

    expect(result.current.watchlist).toEqual([watchlistEntry])
  })
})
