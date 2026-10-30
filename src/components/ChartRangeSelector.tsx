export const RANGES = [
  { label: '1 J', years: 1 },
  { label: '3 J', years: 3 },
  { label: '5 J', years: 5 },
  { label: 'Max', years: null },
] as const

export type ChartRange = (typeof RANGES)[number]

function cutoffDate(lastDate: string, years: number): string {
  const [year, month, day] = lastDate.split('-').map(Number)
  const cutoff = new Date(Date.UTC(year - years, month - 1, day))
  return cutoff.toISOString().slice(0, 10)
}

/** Keeps only the points within `range`, measured back from the series' own last date. */
export function filterByRange<T extends { date: string }>(points: T[], range: ChartRange): T[] {
  if (range.years === null || points.length === 0) return points
  const cutoff = cutoffDate(points.at(-1)!.date, range.years)
  return points.filter((point) => point.date >= cutoff)
}

interface ChartRangeSelectorProps {
  value: ChartRange
  onChange: (range: ChartRange) => void
}

export function ChartRangeSelector({ value, onChange }: ChartRangeSelectorProps) {
  return (
    <div className="chart-ranges" role="group" aria-label="Zeitraum">
      {RANGES.map((r) => (
        <button
          key={r.label}
          type="button"
          className={r.label === value.label ? 'range-button range-button--active' : 'range-button'}
          onClick={() => onChange(r)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
