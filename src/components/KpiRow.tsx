import type { IsoDate } from '../domain/types'
import { todayIso } from '../lib/date'
import { formatCurrency, formatPercent } from '../lib/format'

function daysSince(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number)
  const [ty, tm, td] = todayIso().split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000)
}

/** "seit 42 Tagen" / "seit 2,3 Jahren" — context for an annualized rate on a young portfolio. */
function formatSince(date: IsoDate): string {
  const days = daysSince(date)
  if (days < 365) return `seit ${days} Tag${days === 1 ? '' : 'en'}`
  const years = days / 365
  return `seit ${years.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Jahren`
}

interface KpiRowProps {
  value: number
  invested: number
  /** Money-weighted annualized return (XIRR), or null if not computable yet. */
  annualizedReturn: number | null
  /** Date of the first transaction, for the "seit ..." context next to the rate. */
  since: IsoDate | null
}

export function KpiRow({ value, invested, annualizedReturn, since }: KpiRowProps) {
  const gainAbs = value - invested
  const gainPct = invested === 0 ? 0 : gainAbs / invested
  const sign = gainAbs >= 0 ? 'gain' : 'loss'
  const returnSign = annualizedReturn !== null && annualizedReturn < 0 ? 'loss' : 'gain'

  return (
    <div className="kpi-row">
      <div className="kpi">
        <span className="kpi-label">Depotwert</span>
        <span className="kpi-value num kpi-value--hero">{formatCurrency(value)}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Investiert</span>
        <span className="kpi-value num">{formatCurrency(invested)}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Gewinn/Verlust</span>
        <span className={`kpi-value num kpi-value--${sign}`}>
          {gainAbs >= 0 ? '+' : ''}
          {formatCurrency(gainAbs)}
        </span>
        <span className={`kpi-sub num kpi-value--${sign}`}>
          {gainAbs >= 0 ? '+' : ''}
          {formatPercent(gainPct)}
        </span>
      </div>
      {annualizedReturn !== null && (
        <div className="kpi">
          <span className="kpi-label">Rendite p.a.</span>
          <span className={`kpi-value num kpi-value--${returnSign}`}>
            {annualizedReturn >= 0 ? '+' : ''}
            {formatPercent(annualizedReturn)}
          </span>
          {since && <span className="kpi-sub">{formatSince(since)}</span>}
        </div>
      )}
    </div>
  )
}
