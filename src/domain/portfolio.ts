import type { Position, Transaction } from './types'

interface Lot {
  quantity: number
  /** Total cost basis (average-cost method), including fees. */
  costBasis: number
  realizedGain: number
}

function applyBuy(lot: Lot, quantity: number, price: number, fees: number): Lot {
  return {
    quantity: lot.quantity + quantity,
    costBasis: lot.costBasis + quantity * price + fees,
    realizedGain: lot.realizedGain,
  }
}

/**
 * Below this, a quantity difference is treated as IEEE-754 rounding noise
 * rather than a real holding. Buys accumulate via repeated float addition
 * (e.g. three 0.1-unit savings-plan buys sum to 0.30000000000000004), so a
 * sell of exactly "0.3" must still be accepted and must fully close the
 * position instead of leaving a ~5.5e-17 ghost remainder.
 */
const QUANTITY_EPSILON = 1e-9

/**
 * Apply a sell to a lot using the average-cost method: the cost basis
 * removed is proportional to the share of the holding being sold, valued
 * at the lot's current average cost (not the original purchase prices).
 */
function applySell(lot: Lot, quantity: number, price: number, fees: number): Lot {
  if (quantity > lot.quantity + QUANTITY_EPSILON) {
    throw new RangeError(`cannot sell ${quantity} units, only ${lot.quantity} held`)
  }

  const avgCost = lot.costBasis / lot.quantity
  const costRemoved = quantity * avgCost
  const proceeds = quantity * price - fees
  const realizedGain = proceeds - costRemoved
  const remainingQuantity = lot.quantity - quantity

  // Selling (approximately) everything: snap to exactly zero rather than
  // leaving a float residual that `quantity <= 0` in computePositions
  // wouldn't catch.
  if (Math.abs(remainingQuantity) < QUANTITY_EPSILON) {
    return { quantity: 0, costBasis: 0, realizedGain: lot.realizedGain + realizedGain }
  }

  return {
    quantity: remainingQuantity,
    costBasis: lot.costBasis - costRemoved,
    realizedGain: lot.realizedGain + realizedGain,
  }
}

/**
 * Computes the current open positions from a chronological list of
 * transactions, valued at `latestPrices`. Symbols fully sold off are
 * omitted from the result.
 */
export function computePositions(
  transactions: Transaction[],
  latestPrices: Record<string, number>,
): Position[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

  const lots = new Map<string, Lot>()

  for (const tx of sorted) {
    const lot = lots.get(tx.symbol) ?? { quantity: 0, costBasis: 0, realizedGain: 0 }
    const next =
      tx.type === 'buy'
        ? applyBuy(lot, tx.quantity, tx.price, tx.fees)
        : applySell(lot, tx.quantity, tx.price, tx.fees)
    lots.set(tx.symbol, next)
  }

  const positions: Position[] = []
  for (const [symbol, lot] of lots) {
    if (lot.quantity <= 0) continue

    const avgCost = lot.costBasis / lot.quantity
    const currentPrice = latestPrices[symbol] ?? avgCost
    const marketValue = lot.quantity * currentPrice
    const gainAbs = marketValue - lot.costBasis

    positions.push({
      symbol,
      quantity: lot.quantity,
      costBasis: lot.costBasis,
      avgCost,
      currentPrice,
      marketValue,
      gainAbs,
      gainPct: lot.costBasis === 0 ? 0 : gainAbs / lot.costBasis,
      realizedGain: lot.realizedGain,
    })
  }

  return positions
}
