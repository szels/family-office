import { todayIso } from '../lib/date'
import type { IsoDate, Transaction } from './types'

interface Cashflow {
  date: IsoDate
  amount: number
}

const MS_PER_DAY = 86_400_000
const DAYS_PER_YEAR = 365

function daysBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY
}

/** Net present value of `cashflows` at `rate`, discounted back to `baseDate`. */
function npv(cashflows: Cashflow[], rate: number, baseDate: IsoDate): number {
  return cashflows.reduce((sum, cf) => {
    const years = daysBetween(baseDate, cf.date) / DAYS_PER_YEAR
    return sum + cf.amount / (1 + rate) ** years
  }, 0)
}

function npvDerivative(cashflows: Cashflow[], rate: number, baseDate: IsoDate): number {
  return cashflows.reduce((sum, cf) => {
    const years = daysBetween(baseDate, cf.date) / DAYS_PER_YEAR
    if (years === 0) return sum
    return sum - (years * cf.amount) / (1 + rate) ** (years + 1)
  }, 0)
}

const CONVERGED = 1e-7
const MAX_NEWTON_ITERATIONS = 50
const MAX_BISECTION_ITERATIONS = 200

/** Bisection over [-0.9999, hi], expanding hi until the NPV changes sign. */
function solveByBisection(cashflows: Cashflow[], baseDate: IsoDate): number | null {
  let lo = -0.9999
  let hi = 10
  let npvLo = npv(cashflows, lo, baseDate)
  let npvHi = npv(cashflows, hi, baseDate)

  for (let i = 0; i < 50 && Number.isFinite(npvHi) && npvLo * npvHi > 0; i++) {
    hi *= 2
    npvHi = npv(cashflows, hi, baseDate)
  }
  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi) || npvLo * npvHi > 0) return null

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    const npvMid = npv(cashflows, mid, baseDate)
    if (Math.abs(npvMid) < CONVERGED) return mid
    if (npvLo < 0 === npvMid < 0) {
      lo = mid
      npvLo = npvMid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

/** Solves for the rate at which `npv(cashflows, rate, baseDate) === 0` (XIRR). */
function solveXirr(cashflows: Cashflow[], baseDate: IsoDate): number | null {
  let rate = 0.1
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const value = npv(cashflows, rate, baseDate)
    const derivative = npvDerivative(cashflows, rate, baseDate)
    if (!Number.isFinite(value) || !Number.isFinite(derivative) || derivative === 0) break

    let nextRate = rate - value / derivative
    if (!Number.isFinite(nextRate) || nextRate <= -1) {
      nextRate = (rate + -0.9999) / 2 // step back toward the domain's edge instead of diverging
    }
    if (Math.abs(nextRate - rate) < CONVERGED) return nextRate
    rate = nextRate
  }
  return solveByBisection(cashflows, baseDate)
}

/**
 * Money-weighted annualized return (XIRR): every buy is a cash outflow and
 * every sell a cash inflow on its own date, plus one final inflow of
 * `currentValue` on `asOf` as if the portfolio were liquidated today. This
 * weights each contribution by how long it actually had to grow — unlike a
 * simple CAGR on total gain, a deposit from last week isn't treated as if
 * it had years to compound.
 *
 * Returns `null` when there's nothing to compute: no transactions, or zero
 * time elapsed since the first one (dividing by zero years is undefined).
 */
export function computeAnnualizedReturn(
  transactions: Transaction[],
  currentValue: number,
  asOf: IsoDate = todayIso(),
): number | null {
  if (transactions.length === 0) return null

  const firstDate = transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date)
  if (firstDate === asOf) return null

  const cashflows: Cashflow[] = transactions.map((tx) => ({
    date: tx.date,
    amount: tx.type === 'buy' ? -(tx.quantity * tx.price + tx.fees) : tx.quantity * tx.price - tx.fees,
  }))
  cashflows.push({ date: asOf, amount: currentValue })

  return solveXirr(cashflows, firstDate)
}
