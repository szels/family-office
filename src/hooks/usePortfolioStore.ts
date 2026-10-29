import { useCallback, useEffect, useState } from 'react'
import {
  exportData,
  importData,
  loadInstruments,
  loadSettings,
  loadTransactions,
  saveInstruments,
  saveSettings,
  saveTransactions,
} from '../data/storage'
import type { Instrument, Settings, Transaction } from '../domain/types'

/**
 * Holds transactions, instrument metadata and settings in React state,
 * backed by localStorage. Reads happen once on mount; every state change
 * is written straight back to storage.
 */
export function usePortfolioStore() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadTransactions())
  const [instruments, setInstruments] = useState<Record<string, Instrument>>(() => loadInstruments())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  useEffect(() => saveTransactions(transactions), [transactions])
  useEffect(() => saveInstruments(instruments), [instruments])
  useEffect(() => saveSettings(settings), [settings])

  const addTransaction = useCallback((transaction: Transaction) => {
    setTransactions((prev) => [...prev, transaction])
  }, [])

  const removeTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id))
  }, [])

  const upsertInstrument = useCallback((symbol: string, instrument: Instrument) => {
    setInstruments((prev) => ({ ...prev, [symbol]: instrument }))
  }, [])

  const updateApiKey = useCallback((apiKey: string) => {
    setSettings((prev) => ({ ...prev, apiKey }))
  }, [])

  const importAll = useCallback((json: string) => {
    importData(json)
    setTransactions(loadTransactions())
    setInstruments(loadInstruments())
  }, [])

  return {
    transactions,
    instruments,
    settings,
    addTransaction,
    removeTransaction,
    upsertInstrument,
    updateApiKey,
    importAll,
    exportAll: exportData,
  }
}
