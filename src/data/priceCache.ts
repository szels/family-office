import { fetchWeekly, RateLimitError } from './alphaVantage'
import { loadPriceCache, savePriceCache } from './storage'
import type { IsoDate, PricePoint } from '../domain/types'
import { todayIso } from '../lib/date'

export interface PriceCacheResult {
  series: Record<string, PricePoint[]>
  /** Symbols not refreshed because the daily rate limit was hit (may still carry a cached series). */
  rateLimited: string[]
  /** Symbols that failed for another reason, e.g. an unknown ticker. */
  failed: string[]
}

/**
 * Returns weekly price series for `symbols`, fetching only what isn't
 * already cached for `asOf` (defaults to today). Alpha Vantage's free tier
 * allows 25 requests/day, so once a rate limit is hit, remaining symbols
 * are served from cache (if any) instead of making further calls.
 */
export async function getSeries(
  symbols: string[],
  apiKey: string,
  asOf: IsoDate = todayIso(),
): Promise<PriceCacheResult> {
  const cache = loadPriceCache()
  const series: Record<string, PricePoint[]> = {}
  const rateLimited: string[] = []
  const failed: string[] = []
  let rateLimitHit = false

  for (const symbol of symbols) {
    const cached = cache[symbol]
    if (cached && cached.fetchedAt === asOf) {
      if (cached.failed) {
        failed.push(symbol)
      } else {
        series[symbol] = cached.series
      }
      continue
    }

    if (rateLimitHit) {
      rateLimited.push(symbol)
      if (cached && !cached.failed) series[symbol] = cached.series
      continue
    }

    try {
      const fresh = await fetchWeekly(symbol, apiKey)
      series[symbol] = fresh
      cache[symbol] = { fetchedAt: asOf, series: fresh }
    } catch (error) {
      if (error instanceof RateLimitError) {
        rateLimitHit = true
        rateLimited.push(symbol)
        if (cached && !cached.failed) series[symbol] = cached.series
      } else {
        // Not a quota problem (e.g. an unknown symbol) — mark it so today's
        // later calls don't spend another of the 25 daily requests on it.
        failed.push(symbol)
        cache[symbol] = { fetchedAt: asOf, series: [], failed: true }
      }
    }
  }

  savePriceCache(cache)
  return { series, rateLimited, failed }
}
