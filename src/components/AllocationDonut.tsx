import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import type { Position } from '../domain/types'
import { formatCurrency, formatPercent } from '../lib/format'

const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']
const OTHER_COLOR = 'var(--series-other)'
const MAX_DIRECT_SLICES = 3

interface Slice {
  key: string
  label: string
  value: number
  color: string
}

function buildSlices(positions: Position[]): Slice[] {
  const sorted = [...positions].sort((a, b) => b.marketValue - a.marketValue)
  const direct = sorted.slice(0, MAX_DIRECT_SLICES)
  const rest = sorted.slice(MAX_DIRECT_SLICES)

  const slices: Slice[] = direct.map((position, i) => ({
    key: position.symbol,
    label: position.symbol,
    value: position.marketValue,
    color: SERIES_COLORS[i],
  }))

  if (rest.length > 0) {
    slices.push({
      key: '__other__',
      label: `Weitere (${rest.length})`,
      value: rest.reduce((sum, p) => sum + p.marketValue, 0),
      color: OTHER_COLOR,
    })
  }

  return slices
}

interface AllocationDonutProps {
  positions: Position[]
}

export function AllocationDonut({ positions }: AllocationDonutProps) {
  if (positions.length === 0) {
    return <p className="empty-hint">Noch keine offenen Positionen.</p>
  }

  const slices = buildSlices(positions)
  const total = slices.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="donut">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="98%"
              paddingAngle={2}
              stroke="var(--paper)"
              strokeWidth={2}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Direct labels: required relief since two slot colors fall below 3:1 on the paper surface. */}
      <ul className="donut-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            <span className="donut-swatch" style={{ background: slice.color }} aria-hidden="true" />
            <span className="donut-legend-label">{slice.label}</span>
            <span className="num donut-legend-value">{formatPercent(slice.value / total)}</span>
            <span className="num donut-legend-amount">{formatCurrency(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
