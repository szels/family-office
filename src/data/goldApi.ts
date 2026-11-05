import type { MetalSymbol } from './alphaVantage'

interface GoldApiResponse {
  price?: number
}

/** Fetches the current spot price of gold ('XAU') or silver ('XAG') in USD per troy ounce. Keyless, CORS-enabled. */
export async function fetchSpotUsd(symbol: MetalSymbol): Promise<number> {
  const response = await fetch(`https://api.gold-api.com/price/${symbol}`)
  if (!response.ok) {
    throw new Error('Spotpreis konnte nicht geladen werden: gold-api.com hat nicht geantwortet.')
  }
  const data = (await response.json()) as GoldApiResponse
  if (typeof data.price !== 'number' || !Number.isFinite(data.price)) {
    throw new Error(`gold-api.com lieferte keinen Preis für ${symbol}.`)
  }
  return data.price
}
