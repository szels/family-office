import { computePositions } from './portfolio'
import type { HistoryPoint, IsoDate, PricePoint, Transaction } from './types'

function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10)
}

/** Last close at or before `date`, falling back when no price point qualifies yet. */
function priceOnOrBefore(series: PricePoint[], date: IsoDate, fallback: number): number {
  let result = fallback
  for (const point of series) {
    if (point.date > date) break
    result = point.close
  }
  return result
}

/**
 * Builds a time series of portfolio value vs. invested capital.
 *
 * The timeline is the union of all weekly price-series dates (across every
 * symbol ever held) from the first transaction onward, plus `asOf` itself
 * so the chart always ends "today". Before a symbol has any price point,
 * its holding is valued at its own average cost (no gain/loss shown yet).
 */
export function buildHistory(
  transactions: Transaction[],
  priceSeries: Record<string, PricePoint[]>,
  asOf: IsoDate = todayIso(),
): HistoryPoint[] {
  if (transactions.length === 0) return []

  const firstDate = transactions.reduce(
    (min, tx) => (tx.date < min ? tx.date : min),
    transactions[0].date,
  )

  const dateSet = new Set<IsoDate>()
  for (const series of Object.values(priceSeries)) {
    for (const point of series) {
      if (point.date >= firstDate) dateSet.add(point.date)
    }
  }
  if (dateSet.size === 0 || [...dateSet].sort().at(-1) !== asOf) {
    dateSet.add(asOf)
  }
  const timeline = [...dateSet].sort()

  return timeline.map((date) => {
    const positions = computePositions(transactions.filter((tx) => tx.date <= date), {})

    let value = 0
    let invested = 0
    for (const position of positions) {
      invested += position.costBasis
      const closePrice = priceOnOrBefore(priceSeries[position.symbol] ?? [], date, position.avgCost)
      value += position.quantity * closePrice
    }

    return { date, value, invested }
  })
}
