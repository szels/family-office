import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSeries } from '../data/priceCache'
import type { PricePoint } from '../domain/types'

export type PricesStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UsePricesResult {
  series: Record<string, PricePoint[]>
  /** Last known close per symbol, for valuing positions. */
  latestPrices: Record<string, number>
  status: PricesStatus
  rateLimited: string[]
  failed: string[]
  refresh: () => void
}

/**
 * Loads weekly price series for `symbols` through the daily cache.
 *
 * `symbols` is reduced to a sorted, comma-joined key before it drives any
 * effect: callers that build the array fresh on every render (e.g. from
 * `Object.keys(instruments)`) would otherwise retrigger a fetch on every
 * render, since a new array is `!==` the previous one even with the same
 * contents.
 */
export function usePrices(symbols: string[], apiKey: string | undefined): UsePricesResult {
  const [series, setSeries] = useState<Record<string, PricePoint[]>>({})
  const [status, setStatus] = useState<PricesStatus>('idle')
  const [rateLimited, setRateLimited] = useState<string[]>([])
  const [failed, setFailed] = useState<string[]>([])

  const symbolsKey = symbols.slice().sort().join(',')

  const refresh = useCallback(() => {
    if (!apiKey || symbolsKey === '') return
    setStatus('loading')
    getSeries(symbolsKey.split(','), apiKey)
      .then((result) => {
        setSeries(result.series)
        setRateLimited(result.rateLimited)
        setFailed(result.failed)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [symbolsKey, apiKey])

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

  return { series, latestPrices, status, rateLimited, failed, refresh }
}
