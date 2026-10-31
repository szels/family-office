import { useCallback, useEffect, useState } from 'react'
import { forgetCachedSeries } from '../data/priceCache'
import {
  exportData,
  importData,
  loadInstruments,
  loadSettings,
  loadTransactions,
  loadWatchlist,
  saveInstruments,
  saveSettings,
  saveTransactions,
  saveWatchlist,
} from '../data/storage'
import type { Instrument, Settings, Transaction, WatchlistEntry } from '../domain/types'

/**
 * Holds transactions, instrument metadata, the watchlist and settings in
 * React state, backed by localStorage. Reads happen once on mount; every
 * state change is written straight back to storage.
 */
export function usePortfolioStore() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadTransactions())
  const [instruments, setInstruments] = useState<Record<string, Instrument>>(() => loadInstruments())
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>(() => loadWatchlist())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  useEffect(() => saveTransactions(transactions), [transactions])
  useEffect(() => saveInstruments(instruments), [instruments])
  useEffect(() => saveWatchlist(watchlist), [watchlist])
  useEffect(() => saveSettings(settings), [settings])

  const addTransaction = useCallback((transaction: Transaction) => {
    setTransactions((prev) => [...prev, transaction])
  }, [])

  const removeTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id))
  }, [])

  const updateTransaction = useCallback((id: string, transaction: Transaction) => {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? transaction : tx)))
  }, [])

  const upsertInstrument = useCallback((symbol: string, instrument: Instrument) => {
    setInstruments((prev) => ({ ...prev, [symbol]: instrument }))
  }, [])

  // Only drops the cached price series once nothing else needs it: a
  // symbol can be both an instrument (held) and a watchlist entry at the
  // same time, and removing one of the two shouldn't force a refetch for
  // the other.
  const removeInstrument = useCallback(
    (symbol: string) => {
      setInstruments((prev) => {
        const { [symbol]: _removed, ...rest } = prev
        return rest
      })
      if (!watchlist.some((entry) => entry.symbol === symbol)) forgetCachedSeries(symbol)
    },
    [watchlist],
  )

  const updateApiKey = useCallback((apiKey: string) => {
    setSettings((prev) => ({ ...prev, apiKey }))
  }, [])

  const addToWatchlist = useCallback((entry: WatchlistEntry) => {
    setWatchlist((prev) => (prev.some((e) => e.symbol === entry.symbol) ? prev : [...prev, entry]))
  }, [])

  const removeFromWatchlist = useCallback(
    (symbol: string) => {
      setWatchlist((prev) => prev.filter((entry) => entry.symbol !== symbol))
      if (!instruments[symbol]) forgetCachedSeries(symbol)
    },
    [instruments],
  )

  const importAll = useCallback((json: string) => {
    importData(json)
    setTransactions(loadTransactions())
    setInstruments(loadInstruments())
    setWatchlist(loadWatchlist())
  }, [])

  return {
    transactions,
    instruments,
    watchlist,
    settings,
    addTransaction,
    removeTransaction,
    updateTransaction,
    upsertInstrument,
    removeInstrument,
    addToWatchlist,
    removeFromWatchlist,
    updateApiKey,
    importAll,
    exportAll: exportData,
  }
}
