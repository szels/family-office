import type { IsoDate } from '../domain/types'

/**
 * Today's date in the viewer's local calendar, as "YYYY-MM-DD".
 *
 * Deliberately NOT `new Date().toISOString().slice(0, 10)` — that's UTC,
 * so for anyone west of Greenwich "today" flips a few hours early, and for
 * anyone east of it (e.g. Germany, UTC+1/+2) it flips a few hours late:
 * between local midnight and the UTC rollover, `toISOString()` still
 * reports yesterday.
 */
export function todayIso(): IsoDate {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `date` shifted back by `years` calendar years (Feb 29 rolls over to Mar 1 in non-leap years). */
export function subtractYears(date: IsoDate, years: number): IsoDate {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year - years, month - 1, day)).toISOString().slice(0, 10)
}
