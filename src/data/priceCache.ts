import { fetchMetalWeekly, fetchUsdEurRate, fetchWeekly, isMetalSymbol, RateLimitError } from './alphaVantage'
import { loadPriceCache, savePriceCache } from './storage'
import type { IsoDate, PriceCache, PricePoint } from '../domain/types'
import { todayIso } from '../lib/date'

export interface PriceCacheResult {
  series: Record<string, PricePoint[]>
  /** Symbols not refreshed because the daily rate limit was hit (may still carry a cached series). */
  rateLimited: string[]
  /** Symbols that failed for another reason, e.g. an unknown ticker. */
  failed: string[]
}

/**
 * Orders `symbols` so the stalest ones are fetched first: symbols with no
 * cache entry, then ascending by `fetchedAt`. Ties keep the input order.
 *
 * With a daily quota smaller than the symbol count, a fixed order would
 * spend the quota on the same leading symbols every day and starve the rest.
 */
export function orderByStaleness(symbols: string[], cache: PriceCache): string[] {
  // Never-loaded symbols have no entry; '' sorts before every ISO date.
  // Array#sort is stable, so ties keep the input order.
  return symbols.slice().sort((a, b) => (cache[a]?.fetchedAt ?? '').localeCompare(cache[b]?.fetchedAt ?? ''))
}

/**
 * Returns weekly price series for `symbols`, fetching only what isn't
 * already cached for `asOf` (defaults to today). Alpha Vantage's free tier
 * allows 25 requests/day, so once a rate limit is hit, remaining symbols
 * are served from cache (if any) instead of making further calls. Symbols
 * are processed oldest-cache-first (see `orderByStaleness`), so the daily
 * quota rotates through all symbols over successive runs.
 *
 * Gold/silver (`isMetalSymbol`) come from a separate Alpha Vantage endpoint
 * priced in USD/troy ounce; they're converted to EUR here (via a cached
 * USD→EUR rate, see `resolveEurPerUsd`) so every caller downstream can keep
 * treating every symbol the same.
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

  // Resolves one symbol through `fetcher`, applying the same cache/day and
  // rate-limit-stop rules regardless of the underlying data source (stocks
  // via fetchWeekly, metals via fetchMetalWeekly + FX conversion below).
  async function resolve(symbol: string, fetcher: () => Promise<PricePoint[]>): Promise<void> {
    const cached = cache[symbol]
    if (cached && cached.fetchedAt === asOf) {
      if (cached.failed) {
        failed.push(symbol)
      } else {
        series[symbol] = cached.series
      }
      return
    }

    if (rateLimitHit) {
      rateLimited.push(symbol)
      if (cached && !cached.failed) series[symbol] = cached.series
      return
    }

    try {
      const fresh = await fetcher()
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

  // The USD→EUR rate metals are converted through. Resolved at most once
  // per call — shared by gold and silver — and cached like any other price
  // under the synthetic key "EURUSD", but kept out of `series`/
  // `rateLimited`/`failed`, which only ever list symbols the caller asked
  // for. Throws (RateLimitError or a plain Error) so a calling `resolve()`
  // classifies and surfaces the failure on the metal symbol itself exactly
  // like any other fetch error.
  async function resolveEurPerUsd(): Promise<number> {
    const cached = cache.EURUSD
    if (cached && cached.fetchedAt === asOf) {
      if (cached.failed) throw new Error('USD/EUR-Kurs heute bereits fehlgeschlagen.')
      const rate = cached.series.at(-1)?.close
      if (rate !== undefined) return rate
    }

    try {
      const rate = await fetchUsdEurRate(apiKey)
      cache.EURUSD = { fetchedAt: asOf, series: [{ date: asOf, close: rate }] }
      return rate
    } catch (error) {
      if (!(error instanceof RateLimitError)) {
        cache.EURUSD = { fetchedAt: asOf, series: [], failed: true }
      }
      throw error
    }
  }

  for (const symbol of orderByStaleness(symbols, cache)) {
    if (isMetalSymbol(symbol)) {
      await resolve(symbol, async () => {
        const rate = await resolveEurPerUsd()
        const points = await fetchMetalWeekly(symbol, apiKey)
        return points.map((point) => ({ date: point.date, close: point.close * rate }))
      })
      continue
    }

    await resolve(symbol, () => fetchWeekly(symbol, apiKey))
  }

  savePriceCache(cache)
  return { series, rateLimited, failed }
}

/** Drops a symbol's cached series/failure marker, e.g. after removing its instrument. */
export function forgetCachedSeries(symbol: string): void {
  const cache = loadPriceCache()
  delete cache[symbol]
  savePriceCache(cache)
}
