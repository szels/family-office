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

const RANGES = [
  { label: '1 J', years: 1 },
  { label: '3 J', years: 3 },
  { label: '5 J', years: 5 },
  { label: 'Max', years: null },
] as const

function cutoffDate(lastDate: string, years: number): string {
  const [year, month, day] = lastDate.split('-').map(Number)
  const cutoff = new Date(Date.UTC(year - years, month - 1, day))
  return cutoff.toISOString().slice(0, 10)
}

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
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[3])

  const visible = useMemo(() => {
    if (range.years === null || history.length === 0) return history
    const cutoff = cutoffDate(history.at(-1)!.date, range.years)
    return history.filter((point) => point.date >= cutoff)
  }, [history, range])

  if (history.length === 0) {
    return <p className="empty-hint">Noch keine Kursdaten. Hinterlege einen API-Key und eine erste Transaktion.</p>
  }

  return (
    <div className="history-chart">
      <div className="chart-ranges" role="group" aria-label="Zeitraum">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            className={r.label === range.label ? 'range-button range-button--active' : 'range-button'}
            onClick={() => setRange(r)}
          >
            {r.label}
          </button>
        ))}
      </div>
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
