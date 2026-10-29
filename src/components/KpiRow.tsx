import { formatCurrency, formatPercent } from '../lib/format'

interface KpiRowProps {
  value: number
  invested: number
}

export function KpiRow({ value, invested }: KpiRowProps) {
  const gainAbs = value - invested
  const gainPct = invested === 0 ? 0 : gainAbs / invested
  const sign = gainAbs >= 0 ? 'gain' : 'loss'

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
    </div>
  )
}
