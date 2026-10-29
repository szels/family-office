import type { Instrument, Position } from '../domain/types'
import { formatCurrency, formatPercent, formatQuantity } from '../lib/format'

interface PositionsTableProps {
  positions: Position[]
  instruments: Record<string, Instrument>
}

export function PositionsTable({ positions, instruments }: PositionsTableProps) {
  if (positions.length === 0) {
    return <p className="empty-hint">Noch keine offenen Positionen.</p>
  }

  const sorted = [...positions].sort((a, b) => b.marketValue - a.marketValue)

  return (
    <table className="positions-table">
      <thead>
        <tr>
          <th scope="col">Position</th>
          <th scope="col">Stück</th>
          <th scope="col">Einstand</th>
          <th scope="col">Kurs</th>
          <th scope="col">Wert</th>
          <th scope="col">G/V</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((position) => {
          const sign = position.gainAbs >= 0 ? 'gain' : 'loss'
          const name = instruments[position.symbol]?.name
          return (
            <tr key={position.symbol}>
              <th scope="row">
                <span className="position-symbol">{position.symbol}</span>
                {name && <span className="position-name">{name}</span>}
              </th>
              <td className="num">{formatQuantity(position.quantity)}</td>
              <td className="num">{formatCurrency(position.avgCost)}</td>
              <td className="num">{formatCurrency(position.currentPrice)}</td>
              <td className="num">{formatCurrency(position.marketValue)}</td>
              <td className={`num kpi-value--${sign}`}>
                {position.gainAbs >= 0 ? '+' : ''}
                {formatCurrency(position.gainAbs)}
                <span className="position-gain-pct"> ({formatPercent(position.gainPct)})</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
