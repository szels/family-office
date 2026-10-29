import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePortfolioStore } from './usePortfolioStore'
import { loadInstruments, loadTransactions } from '../data/storage'
import type { Transaction } from '../domain/types'

const buy: Transaction = {
  id: 'tx-1',
  type: 'buy',
  symbol: 'SAP.DEX',
  date: '2026-01-10',
  quantity: 10,
  price: 100,
  fees: 0,
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

  it('upserts an instrument and persists it', () => {
    const { result } = renderHook(() => usePortfolioStore())

    act(() => result.current.upsertInstrument('SAP.DEX', { name: 'SAP SE', kind: 'stock' }))

    expect(result.current.instruments).toEqual({ 'SAP.DEX': { name: 'SAP SE', kind: 'stock' } })
    expect(loadInstruments()).toEqual({ 'SAP.DEX': { name: 'SAP SE', kind: 'stock' } })
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
})
