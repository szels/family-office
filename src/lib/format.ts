import type { IsoDate } from '../domain/types'

const currencyFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const percentFormatter = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const quantityFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 })

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

export function formatPercent(fraction: number): string {
  return percentFormatter.format(fraction)
}

export function formatQuantity(quantity: number): string {
  return quantityFormatter.format(quantity)
}

/** Formats an ISO date ("2026-03-01") as "01.03.2026", without going through `Date`/timezones. */
export function formatDate(date: IsoDate): string {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}`
}
