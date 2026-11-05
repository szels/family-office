import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSeries, type SymbolHint } from '../data/priceCache'
import type { PricePoint } from '../domain/types'

export type PricesStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UsePricesResult {
  series: Record<string, PricePoint[]>
  /** Last known close per symbol, for valuing positions. */
  latestPrices: Record<string, number>
  status: PricesStatus
  rateLimited: string[]
  failed: string[]
  /** Symbols whose free data source was down and had no fallback. */
  unavailable: string[]
  refresh: () => void
}

/**
 * Loads weekly price series for `symbols` through the daily cache.
 *
 * `symbols` is reduced to a sorted, comma-joined key before it drives any
 * effect: callers that build the array fresh on every render (e.g. from
 * `Object.keys(instruments)`) would otherwise retrigger a fetch on every
 * render, since a new array is `!==` the previous one even with the same
 * contents. `hints` gets the same treatment via its JSON form.
 *
 * `apiKey` is optional: stocks and ETFs load from onvista without one; the
 * key only enables the Alpha Vantage fallback and metal price history.
 */
export function usePrices(
  symbols: string[],
  apiKey: string | undefined,
  hints: Record<string, SymbolHint> = {},
): UsePricesResult {
  const [series, setSeries] = useState<Record<string, PricePoint[]>>({})
  const [status, setStatus] = useState<PricesStatus>('idle')
  const [rateLimited, setRateLimited] = useState<string[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [unavailable, setUnavailable] = useState<string[]>([])

  const symbolsKey = symbols.slice().sort().join(',')
  const hintsKey = JSON.stringify(hints)

  const refresh = useCallback(() => {
    if (symbolsKey === '') return
    setStatus('loading')
    getSeries(symbolsKey.split(','), apiKey, undefined, JSON.parse(hintsKey) as Record<string, SymbolHint>)
      .then((result) => {
        setSeries(result.series)
        setRateLimited(result.rateLimited)
        setFailed(result.failed)
        setUnavailable(result.unavailable)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [symbolsKey, apiKey, hintsKey])

  useEffect(() => {
    refresh()
  }, [refresh])

  const latestPrices = useMemo(() => {
    const result: Record<string, number> = {}
    for (const [symbol, points] of Object.entries(series)) {
      const last = points.at(-1)
      if (last) result[symbol] = last.close
    }
    return result
  }, [series])

  return { series, latestPrices, status, rateLimited, failed, unavailable, refresh }
}
