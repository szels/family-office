import type { IsoDate, PricePoint } from '../domain/types'

const BASE_URL = 'https://api.frankfurter.dev/v1'

interface FrankfurterResponse {
  rates?: Record<string, { EUR?: number }>
}

/**
 * Fetches ECB reference rates (1 USD = x EUR) for every business day from
 * `start` through `end`, ascending by date. Keyless, CORS-enabled.
 */
export async function fetchUsdEurSeries(start: IsoDate, end: IsoDate): Promise<PricePoint[]> {
  const response = await fetch(`${BASE_URL}/${start}..${end}?from=USD&to=EUR`)
  if (!response.ok) {
    throw new Error('Wechselkurse konnten nicht geladen werden: Frankfurter hat nicht geantwortet.')
  }

  const data = (await response.json()) as FrankfurterResponse
  const points: PricePoint[] = []
  for (const [date, rate] of Object.entries(data.rates ?? {})) {
    if (rate.EUR !== undefined) points.push({ date, close: rate.EUR })
  }
  if (points.length === 0) {
    throw new Error('Frankfurter lieferte keine USD/EUR-Kurse.')
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}
