import { useEffect, useMemo, useRef, useState } from 'react'
import './app.css'
import { AllocationDonut } from './components/AllocationDonut'
import { HistoryChart } from './components/HistoryChart'
import { KpiRow } from './components/KpiRow'
import { PositionsTable } from './components/PositionsTable'
import { SettingsDialog } from './components/SettingsDialog'
import { TickerChart } from './components/TickerChart'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'
import { Watchlist } from './components/Watchlist'
import { buildHistory } from './domain/history'
import { computePositions } from './domain/portfolio'
import { computeAnnualizedReturn } from './domain/returns'
import type { HistoryPoint, Position, Transaction } from './domain/types'
import { useHashPage, type Page } from './hooks/useHashPage'
import { usePortfolioStore } from './hooks/usePortfolioStore'
import type { SymbolHint } from './data/priceCache'
import { usePrices } from './hooks/usePrices'
import { formatDate } from './lib/format'

const PAGE_LABELS: Record<Page, string> = {
  uebersicht: 'Übersicht',
  markt: 'Markt',
  transaktionen: 'Transaktionen',
}

function App() {
  const [page] = useHashPage()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])
  const store = usePortfolioStore()
  const { transactions, instruments, watchlist, settings } = store
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const formSectionRef = useRef<HTMLElement>(null)

  function startEditing(transaction: Transaction) {
    setEditingTransaction(transaction)
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const symbols = useMemo(() => {
    const set = new Set(transactions.map((tx) => tx.symbol))
    for (const symbol of Object.keys(instruments)) set.add(symbol)
    for (const entry of watchlist) set.add(entry.symbol)
    return [...set]
  }, [transactions, instruments, watchlist])

  // Per symbol: what kind it is, its ISIN (watchlist only) and since when it
  // matters, so prices are loaded from a sensible start date.
  const hints = useMemo(() => {
    const result: Record<string, SymbolHint> = {}
    const earlier = (a: string | undefined, b: string) => (a === undefined || b < a ? b : a)
    for (const [symbol, instrument] of Object.entries(instruments)) result[symbol] = { kind: instrument.kind }
    for (const entry of watchlist) {
      result[entry.symbol] = {
        kind: entry.kind,
        isin: entry.isin,
        since: earlier(result[entry.symbol]?.since, entry.addedAt),
      }
    }
    for (const tx of transactions) {
      const hint = (result[tx.symbol] ??= { kind: instruments[tx.symbol]?.kind ?? 'stock' })
      hint.since = earlier(hint.since, tx.date)
    }
    return result
  }, [transactions, instruments, watchlist])

  const prices = usePrices(symbols, settings.apiKey, hints)

  // Watchlist entries carry their own name/kind but aren't written into
  // `instruments` (that record means "held", driving the positions table
  // etc.) — merge them in just for display in the ticker chart's picker,
  // with an actually-held instrument's own name taking precedence.
  const displayInstruments = useMemo(() => {
    const merged = { ...instruments }
    for (const entry of watchlist) {
      if (!merged[entry.symbol]) merged[entry.symbol] = { name: entry.name, kind: entry.kind }
    }
    return merged
  }, [instruments, watchlist])

  function removeSymbol(symbol: string) {
    if (watchlist.some((entry) => entry.symbol === symbol)) store.removeFromWatchlist(symbol)
    if (instruments[symbol]) store.removeInstrument(symbol)
  }

  const { positions, positionsError } = useMemo(() => {
    try {
      return { positions: computePositions(transactions, prices.latestPrices), positionsError: null }
    } catch (error) {
      return {
        positions: [] as Position[],
        positionsError: error instanceof Error ? error.message : 'Unbekannter Fehler bei der Depotberechnung.',
      }
    }
  }, [transactions, prices.latestPrices])

  const { history, historyError } = useMemo(() => {
    try {
      return { history: buildHistory(transactions, prices.series), historyError: null }
    } catch (error) {
      return {
        history: [] as HistoryPoint[],
        historyError: error instanceof Error ? error.message : 'Unbekannter Fehler bei der Historienberechnung.',
      }
    }
  }, [transactions, prices.series])

  const dataError = positionsError ?? historyError

  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0)
  const totalInvested = positions.reduce((sum, p) => sum + p.costBasis, 0)

  const since = transactions.length === 0
    ? null
    : transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date)

  const annualizedReturn = useMemo(
    () => computeAnnualizedReturn(transactions, totalValue),
    [transactions, totalValue],
  )

  // The newest date actually present in a fetched price series — not
  // "today": buildHistory always appends today's date regardless of
  // whether any fresh quote came back (no API key, rate-limited, or a
  // stale cache all still show a correct "as of" date this way).
  const lastUpdated = Object.values(prices.series)
    .flatMap((series) => series.at(-1)?.date ?? [])
    .sort()
    .at(-1)

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Mein Depot</h1>
          {lastUpdated && <p className="app-subtitle">Kurse vom {formatDate(lastUpdated)}</p>}
        </div>
        <button type="button" className="icon-button" onClick={() => setSettingsOpen((v) => !v)}>
          Einstellungen
        </button>
      </header>

      <nav className="page-nav" aria-label="Seiten">
        {(Object.keys(PAGE_LABELS) as Page[]).map((key) => (
          <a key={key} href={`#/${key}`} aria-current={key === page ? 'page' : undefined}>
            {PAGE_LABELS[key]}
          </a>
        ))}
      </nav>

      {settingsOpen && (
        <section className="app-section">
          <SettingsDialog
            apiKey={settings.apiKey}
            onUpdateApiKey={store.updateApiKey}
            onExport={store.exportAll}
            onImport={store.importAll}
          />
        </section>
      )}

      {!settings.apiKey && (
        <p className="banner banner--info">
          Aktien und ETFs laden ohne Key. Ein kostenloser Alpha&nbsp;Vantage API-Key unter „Einstellungen“ ergänzt den Verlauf von Edelmetallen und dient als Ersatzquelle.
        </p>
      )}
      {dataError && (
        <p className="banner banner--error">
          Datenfehler in den Transaktionen: {dataError} Bitte die betroffene Transaktion auf der Seite{' '}
          <a href="#/transaktionen">Transaktionen</a> korrigieren oder löschen.
        </p>
      )}
      {prices.rateLimited.length > 0 && (
        <p className="banner banner--info">
          Tageslimit der Kurs-API erreicht — zeige zuletzt bekannte Kurse für: {prices.rateLimited.join(', ')}.
        </p>
      )}
      {prices.unavailable.length > 0 && (
        <p className="banner banner--info">
          Kursquelle gerade nicht erreichbar — zeige zuletzt bekannte Kurse für: {prices.unavailable.join(', ')}.
        </p>
      )}
      {prices.failed.length > 0 && (
        <p className="banner banner--error">
          Keine Kursdaten gefunden für: {prices.failed.join(', ')}. Prüfe die Symbole.
        </p>
      )}

      {page === 'uebersicht' && (
        <>
      <section className="app-section">
        <KpiRow value={totalValue} invested={totalInvested} annualizedReturn={annualizedReturn} since={since} />
      </section>

      <section className="app-section">
        <h2>Wertentwicklung</h2>
        <HistoryChart history={history} />
      </section>

      <section className="app-section app-section--split">
        <div>
          <h2>Aufteilung</h2>
          <AllocationDonut positions={positions} />
        </div>
        <div>
          <h2>Positionen</h2>
          <PositionsTable positions={positions} instruments={instruments} />
        </div>
      </section>
        </>
      )}

      {page === 'markt' && (
        <>
      <section className="app-section">
        <h2>Watchlist</h2>
        <Watchlist
          entries={watchlist}
          seriesBySymbol={prices.series}
          onAdd={store.addToWatchlist}
          onRemove={store.removeFromWatchlist}
        />
      </section>

      <section className="app-section">
        <h2>Kursverlauf</h2>
        <TickerChart
          symbols={symbols}
          seriesBySymbol={prices.series}
          transactions={transactions}
          instruments={displayInstruments}
          onRemoveSymbol={removeSymbol}
        />
      </section>
        </>
      )}

      {page === 'transaktionen' && (
        <>
      <section className="app-section" ref={formSectionRef}>
        <h2>{editingTransaction ? 'Transaktion bearbeiten' : 'Transaktion erfassen'}</h2>
        <TransactionForm
          instruments={instruments}
          transactions={transactions}
          apiKey={settings.apiKey}
          editingTransaction={editingTransaction ?? undefined}
          onAdd={store.addTransaction}
          onUpdate={(tx) => store.updateTransaction(tx.id, tx)}
          onUpsertInstrument={store.upsertInstrument}
          onCancelEdit={() => setEditingTransaction(null)}
        />
      </section>

      <section className="app-section">
        <h2>Transaktionen</h2>
        <TransactionList
          transactions={transactions}
          instruments={instruments}
          onEdit={startEditing}
          onRemove={store.removeTransaction}
          editingId={editingTransaction?.id}
        />
      </section>
        </>
      )}
    </div>
  )
}

export default App
