import { describe, expect, it } from 'vitest'
import { buildHistory } from './history'
import type { PricePoint, Transaction } from './types'

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
    date: '2026-02-15',
    quantity: 4,
    price: 120,
    fees: 0,
    ...overrides,
  }
}

function series(points: Array<[string, number]>): PricePoint[] {
  return points.map(([date, close]) => ({ date, close }))
}

describe('buildHistory', () => {
  it('returns no points for an empty transaction list', () => {
    expect(buildHistory([], {}, '2026-03-01')).toEqual([])
  })

  it('falls back to the purchase price before any price point exists, and appends today', () => {
    const points = buildHistory([buy({ quantity: 10, price: 100 })], {}, '2026-03-01')

    expect(points).toEqual([{ date: '2026-03-01', value: 1000, invested: 1000 }])
  })

  it('excludes price points before the first transaction date', () => {
    const points = buildHistory(
      [buy({ date: '2026-02-01', quantity: 10, price: 100 })],
      { 'SAP.DEX': series([['2026-01-01', 90], ['2026-02-15', 110]]) },
      '2026-02-15',
    )

    expect(points.map((p) => p.date)).toEqual(['2026-02-15'])
  })

  it('forward-fills the last known close between price points', () => {
    const points = buildHistory(
      [buy({ date: '2026-01-01', quantity: 10, price: 100 })],
      { 'SAP.DEX': series([['2026-01-10', 110], ['2026-02-10', 130]]) },
      '2026-02-10',
    )

    expect(points).toEqual([
      { date: '2026-01-10', value: 1100, invested: 1000 },
      { date: '2026-02-10', value: 1300, invested: 1000 },
    ])
  })

  it('does not duplicate today when it already matches the last price point', () => {
    const points = buildHistory(
      [buy({ date: '2026-01-01', quantity: 10, price: 100 })],
      { 'SAP.DEX': series([['2026-02-10', 130]]) },
      '2026-02-10',
    )

    expect(points).toHaveLength(1)
    expect(points[0].date).toBe('2026-02-10')
  })

  it('reflects a sell by reducing quantity and invested from the sell date onward', () => {
    // sell happens between the two price points; the timeline only has
    // points from the price series, so the sell's effect shows up at the
    // next one (2026-03-01), not on its own date.
    const transactions = [
      buy({ date: '2026-01-01', quantity: 10, price: 100 }),
      sell({ date: '2026-02-15', quantity: 4, price: 120 }),
    ]
    const points = buildHistory(
      transactions,
      { 'SAP.DEX': series([['2026-02-01', 110], ['2026-03-01', 125]]) },
      '2026-03-01',
    )

    expect(points).toEqual([
      { date: '2026-02-01', value: 1100, invested: 1000 },
      // after the sell: 6 units left, cost basis reduced to 600 (avg-cost)
      { date: '2026-03-01', value: 6 * 125, invested: 600 },
    ])
  })
})
