import { useState } from 'react'
import { normalizeIdentifier, searchSecurity, type SecurityMatch } from '../data/onvista'
import { changeSinceAdded } from '../domain/watchlist'
import type { PricePoint, WatchlistEntry } from '../domain/types'
import { todayIso } from '../lib/date'
import { formatCurrency, formatPercent } from '../lib/format'

interface WatchlistProps {
  entries: WatchlistEntry[]
  seriesBySymbol: Record<string, PricePoint[]>
  onAdd: (entry: WatchlistEntry) => void
  onRemove: (symbol: string) => void
}

export function Watchlist({ entries, seriesBySymbol, onAdd, onRemove }: WatchlistProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle')
  const [results, setResults] = useState<SecurityMatch[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    setError(null)
    setResults([])
    const identifier = normalizeIdentifier(query)
    if (!identifier) {
      setStatus('error')
      setError('Bitte eine gültige ISIN oder WKN eingeben, z. B. IE00B4L5Y983 oder A0RPWH.')
      return
    }

    setStatus('loading')
    try {
      const matches = await searchSecurity(identifier)
      setResults(matches)
      setStatus(matches.length === 0 ? 'empty' : 'idle')
    } catch {
      setStatus('error')
      setError('Suche fehlgeschlagen. Bitte später erneut versuchen.')
    }
  }

  function handleAdd(match: SecurityMatch) {
    onAdd({ ...match, addedAt: todayIso() })
  }

  return (
    <div className="watchlist">
      <form
        className="symbol-search"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSearch()
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ISIN oder WKN" />
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Suche…' : 'Suchen'}
        </button>
        {status === 'error' && error && <p className="form-error">{error}</p>}
        {status === 'empty' && <p className="form-error">Kein Treffer für „{query}“.</p>}
        {results.length > 0 && (
          <ul className="watchlist-results">
            {results.map((match) => {
              const alreadyAdded = entries.some((entry) => entry.symbol === match.symbol)
              return (
                <li key={match.symbol} className="watchlist-match-row">
                  <span className="watchlist-match">
                    <span className="num">{match.symbol}</span> — <span>{match.name}</span>
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => handleAdd(match)}
                    disabled={alreadyAdded}
                  >
                    {alreadyAdded ? 'Bereits beobachtet' : 'Hinzufügen'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </form>

      {entries.length === 0 ? (
        <p className="empty-hint">Noch keine Wertpapiere auf der Watchlist.</p>
      ) : (
        <table className="positions-table">
          <thead>
            <tr>
              <th scope="col">Wertpapier</th>
              <th scope="col">ISIN · WKN</th>
              <th scope="col">Kurs</th>
              <th scope="col">Seit Aufnahme</th>
              <th scope="col" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const series = seriesBySymbol[entry.symbol]
              const price = series?.at(-1)?.close
              // Guard against empty series rather than passing it to
              // changeSinceAdded: no cached price yet means nothing to
              // compare against.
              const change = series && series.length > 0 ? changeSinceAdded(series, entry.addedAt) : null
              const sign = change !== null && change < 0 ? 'loss' : 'gain'
              return (
                <tr key={entry.symbol}>
                  <th scope="row">
                    <span className="position-symbol">{entry.symbol}</span>
                    <span className="position-name">{entry.name}</span>
                  </th>
                  <td className="num">
                    {entry.isin} · {entry.wkn}
                  </td>
                  <td className="num">{price !== undefined ? formatCurrency(price) : '–'}</td>
                  <td className={change !== null ? `num kpi-value--${sign}` : 'num'}>
                    {change !== null ? `${change >= 0 ? '+' : ''}${formatPercent(change)}` : '–'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Symbol ${entry.symbol} entfernen`}
                      onClick={() => onRemove(entry.symbol)}
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
