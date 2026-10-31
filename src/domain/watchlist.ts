import type { IsoDate, PricePoint } from './types'

/**
 * Fractional change (0.1 = 10%) between the price a watchlist entry was
 * added at and the latest known price, or `null` if there's no price data
 * yet at all.
 *
 * TODO(Steffen): implement this. `series` is ascending by date (see
 * `PricePoint`). You need two prices out of it:
 *   - the "added at" price: the last close at or before `addedAt` — if
 *     `addedAt` is earlier than every point in `series` (e.g. the entry
 *     was added before any cached price existed), fall back to the
 *     *first* point instead of treating it as "no data".
 *   - the latest price: simply the last point in `series`.
 * Then return `(latest - addedPrice) / addedPrice`.
 *
 * The tests in `watchlist.test.ts` are already written — run
 * `npm test -- watchlist` to check your implementation against them.
 */
export function changeSinceAdded(series: PricePoint[], addedAt: IsoDate): number | null {
  throw new Error('not implemented yet')
}
