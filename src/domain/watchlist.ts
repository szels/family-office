import type { IsoDate, PricePoint } from './types'

/**
 * Fractional change (0.1 = 10%) between the price a watchlist entry was
 * added at and the latest known price, or `null` if there's no price data
 * yet at all.
 */
export function changeSinceAdded(series: PricePoint[], addedAt: IsoDate): number | null {
  if (series.length === 0) return null

  // Last close at or before `addedAt`; falls back to the first point when
  // `addedAt` predates the whole series (e.g. added before any price was
  // cached yet).
  let addedPrice = series[0].close
  for (const point of series) {
    if (point.date > addedAt) break
    addedPrice = point.close
  }

  const latest = series.at(-1)!.close
  return (latest - addedPrice) / addedPrice
}
