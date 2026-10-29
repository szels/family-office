import { describe, expect, it } from 'vitest'
import { computeAnnualizedReturn } from './returns'
import type { Transaction } from './types'

function buy(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-buy',
    type: 'buy',
    symbol: 'SAP.DEX',
    date: '2026-01-01',
    quantity: 10,
    price: 100, // -> cashflow -1000
    fees: 0,
    ...overrides,
  }
}

function sell(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-sell',
    type: 'sell',
    symbol: 'SAP.DEX',
    date: '2027-01-01',
    quantity: 3,
    price: 100, // -> cashflow +300
    fees: 0,
    ...overrides,
  }
}

describe('computeAnnualizedReturn', () => {
  it('returns null when there are no transactions', () => {
    expect(computeAnnualizedReturn([], 0, '2026-01-01')).toBeNull()
  })

  it('returns null when no time has elapsed since the first transaction', () => {
    expect(computeAnnualizedReturn([buy({ date: '2026-01-01' })], 1000, '2026-01-01')).toBeNull()
  })

  it('matches the exact rate for a single buy and a value two years later', () => {
    // -1000 @ t0, +1210 @ t+2y -> (1+r)^2 = 1.21 -> r = 0.1 exactly
    const rate = computeAnnualizedReturn([buy({ date: '2026-01-01' })], 1210, '2028-01-01')
    expect(rate).toBeCloseTo(0.1, 4)
  })

  it('matches the exact rate for a loss', () => {
    // -1000 @ t0, +800 @ t+1y -> r = -0.2 exactly
    const rate = computeAnnualizedReturn([buy({ date: '2026-01-01' })], 800, '2027-01-01')
    expect(rate).toBeCloseTo(-0.2, 4)
  })

  it('weights two buys at different dates by their timing (money-weighted return)', () => {
    // -1000 @ t0, -1000 @ t+1y, +2310 @ t+2y -> r = 0.1 exactly
    const transactions = [
      buy({ id: 'a', date: '2026-01-01' }),
      buy({ id: 'b', date: '2027-01-01' }),
    ]
    const rate = computeAnnualizedReturn(transactions, 2310, '2028-01-01')
    expect(rate).toBeCloseTo(0.1, 4)
  })

  it('includes a sell as a positive cashflow on its own date', () => {
    // -1000 @ t0, +300 @ t+1y (sell), +880 @ t+2y (current value) -> r = 0.1 exactly
    const transactions = [buy({ date: '2026-01-01' }), sell({ date: '2027-01-01' })]
    const rate = computeAnnualizedReturn(transactions, 880, '2028-01-01')
    expect(rate).toBeCloseTo(0.1, 4)
  })

  it('includes fees in the cashflow amount', () => {
    // -(10*100+50) = -1050 @ t0, +1155 @ t+1y -> r = 0.1 exactly (only if fees counted)
    const transactions = [buy({ date: '2026-01-01', fees: 50 })]
    const rate = computeAnnualizedReturn(transactions, 1155, '2027-01-01')
    expect(rate).toBeCloseTo(0.1, 4)
  })
})
