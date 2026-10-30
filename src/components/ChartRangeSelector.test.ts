import { describe, expect, it } from 'vitest'
import { filterByRange, RANGES } from './ChartRangeSelector'

const ONE_YEAR = RANGES[0] // '1 J'
const MAX = RANGES[3] // 'Max'

describe('filterByRange', () => {
  it('returns everything for "Max"', () => {
    const points = [{ date: '2020-01-01' }, { date: '2026-01-01' }]
    expect(filterByRange(points, MAX)).toEqual(points)
  })

  it('returns an empty array unchanged', () => {
    expect(filterByRange([], ONE_YEAR)).toEqual([])
  })

  it('cuts off relative to the series\' own last date, inclusive of the boundary', () => {
    const points = [
      { date: '2024-01-01' },
      { date: '2024-06-15' },
      { date: '2024-12-31' },
      { date: '2025-06-15' },
    ]
    expect(filterByRange(points, ONE_YEAR)).toEqual([{ date: '2024-06-15' }, { date: '2024-12-31' }, { date: '2025-06-15' }])
  })

  it('handles a leap-day last date by rolling the cutoff to March 1st', () => {
    // 2024 is a leap year; Date.UTC(2023, 1, 29) rolls forward to 2023-03-01
    // since 2023 has no Feb 29 — the cutoff must reflect that, not crash.
    const points = [{ date: '2023-02-28' }, { date: '2023-03-01' }, { date: '2024-02-29' }]
    expect(filterByRange(points, ONE_YEAR)).toEqual([{ date: '2023-03-01' }, { date: '2024-02-29' }])
  })
})
