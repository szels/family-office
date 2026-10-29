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
 * Apply a sell to a lot using the average-cost method: the cost basis
 * removed is proportional to the share of the holding being sold, valued
 * at the lot's current average cost (not the original purchase prices).
 *
 * TODO(Steffen): implement this. Average cost per unit before the sale is
 * `lot.costBasis / lot.quantity`. You need to:
 *   1. Guard: if `quantity` is more than `lot.quantity`, throw a
 *      `RangeError` (selling more than you hold is a user input error).
 *   2. Compute `avgCost = lot.costBasis / lot.quantity`.
 *   3. Compute the cost basis removed: `quantity * avgCost`.
 *   4. Compute realized gain for this sell: proceeds (`quantity * price - fees`)
 *      minus the cost basis removed — add it to `lot.realizedGain`.
 *   5. Return the new lot: quantity reduced by `quantity`, costBasis reduced
 *      by the amount removed in step 3, realizedGain from step 4.
 *
 * The tests in portfolio.test.ts ("reduces quantity...", "tracks realized
 * gain...", "removes the position...", "throws when selling more...") are
 * red until this is implemented — run `npm test` to see them fail, then
 * make them pass.
 */
function applySell(lot: Lot, quantity: number, price: number, fees: number): Lot {
  if (quantity > lot.quantity) {
    throw new RangeError(
      `cannot sell ${quantity} units, only ${lot.quantity} held`,
    )
  }

  const avgCost = lot.costBasis / lot.quantity
  const costRemoved = quantity * avgCost
  const proceeds = quantity * price - fees
  const realizedGain = proceeds - costRemoved

  return {
    quantity: lot.quantity - quantity,
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
