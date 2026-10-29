import { describe, expect, it } from 'vitest'
import { computePositions } from './portfolio'
import type { Transaction } from './types'

function buy(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-buy',
    type: 'buy',
    symbol: 'SAP.DEX',
    date: '2026-01-10',
    quantity: 10,
    price: 100,
    fees: 0,
    ...overrides,
  }
}

function sell(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-sell',
    type: 'sell',
    symbol: 'SAP.DEX',
    date: '2026-02-10',
    quantity: 4,
    price: 120,
    fees: 0,
    ...overrides,
  }
}

describe('computePositions', () => {
  it('returns no positions for an empty transaction list', () => {
    expect(computePositions([], {})).toEqual([])
  })

  it('creates a position from a single buy, valued at the latest price', () => {
    const positions = computePositions([buy()], { 'SAP.DEX': 150 })

    expect(positions).toEqual([
      {
        symbol: 'SAP.DEX',
        quantity: 10,
        costBasis: 1000,
        avgCost: 100,
        currentPrice: 150,
        marketValue: 1500,
        gainAbs: 500,
        gainPct: 0.5,
        realizedGain: 0,
      },
    ])
  })

  it('averages the cost basis across multiple buys of the same symbol', () => {
    const transactions = [
      buy({ id: 'a', quantity: 10, price: 100 }),
      buy({ id: 'b', quantity: 10, price: 120 }),
    ]

    const [position] = computePositions(transactions, { 'SAP.DEX': 100 })

    expect(position.quantity).toBe(20)
    expect(position.costBasis).toBe(2200)
    expect(position.avgCost).toBe(110)
  })

  it('includes fees in the cost basis', () => {
    const [position] = computePositions([buy({ fees: 9.9 })], { 'SAP.DEX': 100 })

    expect(position.costBasis).toBe(1009.9)
  })

  it('reduces quantity and keeps the average cost after a partial sell', () => {
    const transactions = [
      buy({ id: 'a', quantity: 10, price: 100 }),
      sell({ id: 'b', quantity: 4, price: 120 }),
    ]

    const [position] = computePositions(transactions, { 'SAP.DEX': 100 })

    expect(position.quantity).toBe(6)
    expect(position.avgCost).toBe(100)
    expect(position.costBasis).toBe(600)
  })

  it('tracks realized gain using the average-cost method', () => {
    const transactions = [
      buy({ id: 'a', quantity: 10, price: 100 }),
      sell({ id: 'b', quantity: 4, price: 120 }),
    ]

    const [position] = computePositions(transactions, { 'SAP.DEX': 100 })

    // sold 4 @120 (proceeds 480) against avg cost 100 -> realized gain 80
    expect(position.realizedGain).toBe(80)
  })

  it('removes the position once the full quantity has been sold', () => {
    const transactions = [buy({ quantity: 10, price: 100 }), sell({ quantity: 10, price: 120 })]

    expect(computePositions(transactions, { 'SAP.DEX': 100 })).toEqual([])
  })

  it('throws when selling more than currently held', () => {
    const transactions = [buy({ quantity: 10, price: 100 }), sell({ quantity: 11, price: 120 })]

    expect(() => computePositions(transactions, { 'SAP.DEX': 100 })).toThrow(RangeError)
  })

  it('allows selling a holding whose floating-point sum is a hair above the sell quantity', () => {
    // 0.1 + 0.1 + 0.1 === 0.30000000000000004 in IEEE 754 — a real shape for
    // ETF savings-plan buys. Selling exactly "0.3" must fully close it.
    const transactions = [
      buy({ id: 'a', quantity: 0.1, price: 100 }),
      buy({ id: 'b', quantity: 0.1, price: 100 }),
      buy({ id: 'c', quantity: 0.1, price: 100 }),
      sell({ id: 'd', quantity: 0.3, price: 120 }),
    ]

    expect(computePositions(transactions, { 'SAP.DEX': 100 })).toEqual([])
  })

  it('rejects a sell that exceeds the holding by more than floating-point noise', () => {
    const transactions = [buy({ quantity: 0.3, price: 100 }), sell({ quantity: 0.31, price: 120 })]

    expect(() => computePositions(transactions, { 'SAP.DEX': 100 })).toThrow(RangeError)
  })

  it('keeps separate positions per symbol', () => {
    const transactions = [
      buy({ id: 'a', symbol: 'SAP.DEX', quantity: 10, price: 100 }),
      buy({ id: 'b', symbol: 'EUNL.DEX', quantity: 5, price: 50 }),
    ]

    const positions = computePositions(transactions, { 'SAP.DEX': 100, 'EUNL.DEX': 50 })

    expect(positions.map((p) => p.symbol).sort()).toEqual(['EUNL.DEX', 'SAP.DEX'])
  })
})
