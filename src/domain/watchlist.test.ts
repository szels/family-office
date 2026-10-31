import { describe, expect, it } from 'vitest'
import { changeSinceAdded } from './watchlist'
import type { PricePoint } from './types'

const series: PricePoint[] = [
  { date: '2026-01-05', close: 100 },
  { date: '2026-01-12', close: 110 },
  { date: '2026-01-19', close: 121 },
]

describe('changeSinceAdded', () => {
  it('compares the latest close to the close on/before addedAt', () => {
    // added right on the middle point (110) → latest (121) is +10%
    expect(changeSinceAdded(series, '2026-01-12')).toBeCloseTo(0.1)
  })

  it('uses the last close at or before addedAt when added between two price points', () => {
    // added between the first two points → still compares against 100
    expect(changeSinceAdded(series, '2026-01-10')).toBeCloseTo(0.21)
  })

  it('falls back to the first known close when added before the series starts', () => {
    expect(changeSinceAdded(series, '2025-12-01')).toBeCloseTo(0.21)
  })

  it('is zero right after adding, when addedAt is the latest point', () => {
    expect(changeSinceAdded(series, '2026-01-19')).toBe(0)
  })

  it('returns null for an empty series', () => {
    expect(changeSinceAdded([], '2026-01-12')).toBeNull()
  })
})
