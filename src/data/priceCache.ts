import {
  fetchMetalWeekly,
  fetchWeekly,
  isMetalSymbol,
  RateLimitError,
  UnknownSymbolError,
  type MetalSymbol,
} from './alphaVantage'
import { fetchUsdEurSeries } from './frankfurter'
import { fetchSpotUsd } from './goldApi'
import { fetchDailyHistory, lookupIsin } from './onvista'
import { loadIsinCache, loadPriceCache, saveIsinCache, savePriceCache } from './storage'
import type { InstrumentKind, IsoDate, PriceCache, PricePoint } from '../domain/types'
import { subtractYears, todayIso } from '../lib/date'

/** Cache key for the shared USD→EUR series; not a real symbol, never returned to callers. */
const FX_KEY = 'FX:USDEUR'

/** How far before the first transaction/watchlist date to load, so the chart has a lead-in. */
const LEAD_IN_YEARS = 1

export interface PriceCacheResult {
  series: Record<string, PricePoint[]>
  /** Symbols not refreshed because the Alpha Vantage daily limit was hit (may still carry a cached series). */
  rateLimited: string[]
  /** Symbols that failed for another reason, e.g. an unknown ticker. */
  failed: string[]
  /** Symbols whose free data source didn't answer and had no fallback; retried on the next refresh. */
  unavailable: string[]
}

/** What `getSeries` needs to know about a symbol beyond its name. */
export interface SymbolHint {
  kind: InstrumentKind
  /** Known ISIN (e.g. from the watchlist); saves an onvista search. */
  isin?: string
  /** Earliest date the symbol matters (first transaction or watchlist date). */
  since?: IsoDate
}

/**
 * Thrown when a free data source is down and nothing else can answer. Unlike
 * an unknown symbol this is transient, so it must not poison the day's cache.
 */
export class SourceUnavailableError extends Error {}

/**
 * Decides whether a failed onvista lookup may spend an Alpha Vantage request.
 *
 * Only asked when an API key exists. TODO(user): this is the policy knob; the
 * default always falls back. Consider: should a missing ISIN (`error` is an
 * UnknownSymbolError) spend one of AV's 25 daily requests? Should a
 * SourceUnavailableError, e.g. a 429 from onvista?
 */
export function shouldFallBackToAlphaVantage(_error: unknown): boolean {
  return true
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

/** Last rate at or before `date`; the first rate if `date` precedes the series. */
function rateOnOrBefore(rates: PricePoint[], date: IsoDate): number {
  let result = rates[0].close
  for (const rate of rates) {
    if (rate.date > date) break
    result = rate.close
  }
  return result
}

/**
 * Returns price series for `symbols`, fetching only what isn't already
 * cached for `asOf` (defaults to today).
 *
 * Stocks and ETFs come from onvista as daily EUR closes (keyless, no daily
 * quota). Alpha Vantage — 25 requests/day, weekly closes — is only the
 * fallback (see `shouldFallBackToAlphaVantage`); once its limit is hit,
 * remaining fallbacks are served from cache instead of making further
 * calls. Symbols are processed oldest-cache-first (`orderByStaleness`), so
 * the AV quota rotates through all symbols over successive runs.
 *
 * Gold/silver (`isMetalSymbol`) get their history from Alpha Vantage in
 * USD/troy ounce (needs `apiKey`), a live spot price from gold-api.com, and
 * are converted to EUR with the ECB rate of each day (Frankfurter), so every
 * caller downstream can keep treating every symbol the same.
 */
export async function getSeries(
  symbols: string[],
  apiKey: string | undefined,
  asOf: IsoDate = todayIso(),
  hints: Record<string, SymbolHint> = {},
): Promise<PriceCacheResult> {
  const cache = loadPriceCache()
  delete cache.EURUSD // pre-daily-rates single-point entry; the series now lives under FX_KEY
  const isinCache = loadIsinCache()
  const series: Record<string, PricePoint[]> = {}
  const rateLimited: string[] = []
  const failed: string[] = []
  const unavailable: string[] = []
  let alphaVantageLimitHit = false

  const startFor = (symbol: string): IsoDate => subtractYears(hints[symbol]?.since ?? asOf, LEAD_IN_YEARS)

  // Resolves one symbol through `fetcher`, applying the same cache/day and
  // failure rules regardless of the underlying data source.
  async function resolve(symbol: string, from: IsoDate, fetcher: () => Promise<PricePoint[]>): Promise<void> {
    const cached = cache[symbol]
    if (cached && cached.fetchedAt === asOf && (!cached.from || cached.from <= from)) {
      if (cached.failed) {
        failed.push(symbol)
      } else {
        series[symbol] = cached.series
      }
      return
    }

    const serveStale = () => {
      if (cached && !cached.failed) series[symbol] = cached.series
    }

    try {
      const fresh = await fetcher()
      series[symbol] = fresh
      cache[symbol] = { fetchedAt: asOf, from, series: fresh }
    } catch (error) {
      if (error instanceof RateLimitError) {
        alphaVantageLimitHit = true
        rateLimited.push(symbol)
        serveStale()
      } else if (error instanceof SourceUnavailableError) {
        // Transient: keep yesterday's data and try again on the next refresh.
        unavailable.push(symbol)
        serveStale()
      } else {
        // Not a quota problem (e.g. an unknown symbol) — mark it so today's
        // later calls don't repeat the lookup.
        failed.push(symbol)
        cache[symbol] = { fetchedAt: asOf, from, series: [], failed: true }
      }
    }
  }

  async function fetchAlphaVantageWeekly(symbol: string): Promise<PricePoint[]> {
    if (alphaVantageLimitHit) throw new RateLimitError('Alpha Vantage rate limit already reached today')
    return fetchWeekly(symbol, apiKey as string)
  }

  async function findIsin(symbol: string): Promise<string | null> {
    const known = hints[symbol]?.isin ?? isinCache[symbol]
    if (known) return known
    const found = await lookupIsin(symbol)
    if (found) isinCache[symbol] = found
    return found
  }

  // onvista first; Alpha Vantage only if the policy allows it.
  async function fetchSecurity(symbol: string): Promise<PricePoint[]> {
    let onvistaError: unknown
    try {
      const isin = await findIsin(symbol)
      if (isin) return await fetchDailyHistory(isin, hints[symbol]?.kind ?? 'stock', startFor(symbol))
      onvistaError = new UnknownSymbolError(`Keine ISIN für Symbol "${symbol}" gefunden.`)
    } catch (error) {
      onvistaError = new SourceUnavailableError(error instanceof Error ? error.message : 'onvista nicht erreichbar.')
    }

    if (apiKey && shouldFallBackToAlphaVantage(onvistaError)) return fetchAlphaVantageWeekly(symbol)
    throw onvistaError
  }

  // The USD→EUR series metals are converted through. Resolved at most once
  // per call — shared by gold and silver — and cached under FX_KEY, but kept
  // out of `series`/`rateLimited`/`failed`, which only ever list symbols the
  // caller asked for.
  let fxPromise: Promise<PricePoint[]> | undefined
  function resolveUsdEur(from: IsoDate): Promise<PricePoint[]> {
    fxPromise ??= (async () => {
      const cached = cache[FX_KEY]
      if (cached && cached.fetchedAt === asOf && !cached.failed && (!cached.from || cached.from <= from)) {
        return cached.series
      }
      try {
        const rates = await fetchUsdEurSeries(from, asOf)
        cache[FX_KEY] = { fetchedAt: asOf, from, series: rates }
        return rates
      } catch (error) {
        throw new SourceUnavailableError(error instanceof Error ? error.message : 'Frankfurter nicht erreichbar.')
      }
    })()
    return fxPromise
  }

  async function fetchMetal(symbol: MetalSymbol, from: IsoDate): Promise<PricePoint[]> {
    const rates = await resolveUsdEur(from)

    // History needs Alpha Vantage; without a key we can still show today's spot.
    if (apiKey && alphaVantageLimitHit) throw new RateLimitError('Alpha Vantage rate limit already reached today')
    const history = apiKey ? await fetchMetalWeekly(symbol, apiKey) : []
    const spot = await fetchSpotUsd(symbol).catch(() => null)

    const points = history
      .filter((point) => point.date >= from)
      .map((point) => ({ date: point.date, close: point.close * rateOnOrBefore(rates, point.date) }))
    if (spot !== null) {
      const today = { date: asOf, close: spot * rateOnOrBefore(rates, asOf) }
      const last = points.at(-1)
      if (last?.date === asOf) points[points.length - 1] = today
      else points.push(today)
    }

    if (points.length === 0) {
      throw new SourceUnavailableError(`Keine Kurse für ${symbol}: Spotpreis nicht erreichbar und kein API-Key für den Verlauf.`)
    }
    return points
  }

  for (const symbol of orderByStaleness(symbols, cache)) {
    const from = startFor(symbol)
    if (isMetalSymbol(symbol)) {
      await resolve(symbol, from, () => fetchMetal(symbol, from))
    } else {
      await resolve(symbol, from, () => fetchSecurity(symbol))
    }
  }

  savePriceCache(cache)
  saveIsinCache(isinCache)
  return { series, rateLimited, failed, unavailable }
}

/** Drops a symbol's cached series/failure marker, e.g. after removing its instrument. */
export function forgetCachedSeries(symbol: string): void {
  const cache = loadPriceCache()
  delete cache[symbol]
  savePriceCache(cache)
}
