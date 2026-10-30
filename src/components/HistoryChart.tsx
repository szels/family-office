import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { HistoryPoint } from '../domain/types'
import { formatCurrency, formatDate } from '../lib/format'
import { ChartRangeSelector, filterByRange, RANGES, type ChartRange } from './ChartRangeSelector'

function CustomTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{formatDate(String(label))}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey as string} className="chart-tooltip-row">
          <span>{entry.name}</span>
          <span className="num">{formatCurrency(Number(entry.value))}</span>
        </div>
      ))}
    </div>
  )
}

interface HistoryChartProps {
  history: HistoryPoint[]
}

export function HistoryChart({ history }: HistoryChartProps) {
  const [range, setRange] = useState<ChartRange>(RANGES[3])

  const visible = useMemo(() => filterByRange(history, range), [history, range])

  if (history.length === 0) {
    return <p className="empty-hint">Noch keine Kursdaten. Hinterlege einen API-Key und eine erste Transaktion.</p>
  }

  return (
    <div className="history-chart">
      <ChartRangeSelector value={range} onChange={setRange} />
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={visible} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--rule)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatDate(value)}
            stroke="var(--ink-muted)"
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(value: number) => formatCurrency(value)}
            stroke="var(--ink-muted)"
            tick={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            width={90}
          />
          <Tooltip content={CustomTooltip} />
          <Line
            type="monotone"
            dataKey="invested"
            name="Investiert"
            stroke="var(--ink-muted)"
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            name="Depotwert"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-swatch chart-legend-swatch--value" aria-hidden="true" /> Depotwert
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-swatch chart-legend-swatch--invested" aria-hidden="true" /> Investiert
        </span>
      </div>
    </div>
  )
}
