import { useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { Instrument, PricePoint, Transaction } from '../domain/types'
import { formatCurrency, formatDate } from '../lib/format'

interface ChartPoint {
  date: string
  close: number
  buyMarker: number | null
  sellMarker: number | null
}

/** Merges a price series with transaction dates so buy/sell markers always land on the line. */
function buildChartData(series: PricePoint[], transactions: Transaction[]): ChartPoint[] {
  const byDate = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const dateSet = new Set(series.map((p) => p.date))
  for (const tx of byDate) dateSet.add(tx.date)
  const dates = [...dateSet].sort()

  let seriesIdx = 0
  let lastClose: number | null = null
  const fallback = byDate[0]?.price ?? 0

  return dates.map((date) => {
    while (seriesIdx < series.length && series[seriesIdx].date <= date) {
      lastClose = series[seriesIdx].close
      seriesIdx++
    }
    const close = lastClose ?? fallback
    const buy = byDate.find((tx) => tx.date === date && tx.type === 'buy')
    const sell = byDate.find((tx) => tx.date === date && tx.type === 'sell')
    return { date, close, buyMarker: buy ? close : null, sellMarker: sell ? close : null }
  })
}

function TickerTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload as ChartPoint
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{formatDate(String(label))}</div>
      <div className="chart-tooltip-row">
        <span>Kurs</span>
        <span className="num">{formatCurrency(point.close)}</span>
      </div>
      {point.buyMarker !== null && <div className="chart-tooltip-row chart-tooltip-row--gain">Kauf</div>}
      {point.sellMarker !== null && <div className="chart-tooltip-row chart-tooltip-row--loss">Verkauf</div>}
    </div>
  )
}

interface TickerChartProps {
  symbols: string[]
  seriesBySymbol: Record<string, PricePoint[]>
  transactions: Transaction[]
  instruments: Record<string, Instrument>
}

export function TickerChart({ symbols, seriesBySymbol, transactions, instruments }: TickerChartProps) {
  const [selected, setSelected] = useState(symbols[0] ?? '')
  // A symbol can disappear (last position in it sold off) between renders;
  // fall back to the first available one without a render-triggering effect.
  const effectiveSelected = symbols.includes(selected) ? selected : symbols[0] ?? ''

  if (symbols.length === 0) {
    return <p className="empty-hint">Noch keine Position zum Anzeigen.</p>
  }

  const symbolTransactions = transactions.filter((tx) => tx.symbol === effectiveSelected)
  const data = buildChartData(seriesBySymbol[effectiveSelected] ?? [], symbolTransactions)

  return (
    <div className="ticker-chart">
      <label className="ticker-select-label">
        Symbol
        <select
          value={effectiveSelected}
          onChange={(event) => setSelected(event.target.value)}
          className="ticker-select"
        >
          {symbols.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
              {instruments[symbol]?.name ? ` – ${instruments[symbol].name}` : ''}
            </option>
          ))}
        </select>
      </label>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
          <Tooltip content={TickerTooltip} />
          <Line type="monotone" dataKey="close" name="Kurs" stroke="var(--series-1)" strokeWidth={2} dot={false} />
          <Scatter dataKey="buyMarker" name="Kauf" fill="var(--gain)" />
          <Scatter dataKey="sellMarker" name="Verkauf" fill="var(--loss)" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-dot chart-legend-dot--gain" aria-hidden="true" /> Kauf
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-dot chart-legend-dot--loss" aria-hidden="true" /> Verkauf
        </span>
      </div>
    </div>
  )
}
