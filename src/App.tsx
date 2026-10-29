import { useMemo, useState } from 'react'
import './app.css'
import { AllocationDonut } from './components/AllocationDonut'
import { HistoryChart } from './components/HistoryChart'
import { KpiRow } from './components/KpiRow'
import { PositionsTable } from './components/PositionsTable'
import { SettingsDialog } from './components/SettingsDialog'
import { TickerChart } from './components/TickerChart'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'
import { buildHistory } from './domain/history'
import { computePositions } from './domain/portfolio'
import type { HistoryPoint, Position } from './domain/types'
import { usePortfolioStore } from './hooks/usePortfolioStore'
import { usePrices } from './hooks/usePrices'

function App() {
  const store = usePortfolioStore()
  const { transactions, instruments, settings } = store
  const [settingsOpen, setSettingsOpen] = useState(false)

  const symbols = useMemo(() => {
    const set = new Set(transactions.map((tx) => tx.symbol))
    for (const symbol of Object.keys(instruments)) set.add(symbol)
    return [...set]
  }, [transactions, instruments])

  const prices = usePrices(symbols, settings.apiKey)

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
  const lastUpdated = history.at(-1)?.date

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Mein Depot</h1>
          {lastUpdated && <p className="app-subtitle">Kurse vom {lastUpdated.split('-').reverse().join('.')}</p>}
        </div>
        <button type="button" className="icon-button" onClick={() => setSettingsOpen((v) => !v)}>
          Einstellungen
        </button>
      </header>

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
          Hinterlege einen kostenlosen Alpha&nbsp;Vantage API-Key unter „Einstellungen“, um aktuelle Kurse zu laden.
        </p>
      )}
      {dataError && (
        <p className="banner banner--error">
          Datenfehler in den Transaktionen: {dataError} Bitte die betroffene Transaktion unten in der Liste
          korrigieren oder löschen.
        </p>
      )}
      {prices.rateLimited.length > 0 && (
        <p className="banner banner--info">
          Tageslimit der Kurs-API erreicht — zeige zuletzt bekannte Kurse für: {prices.rateLimited.join(', ')}.
        </p>
      )}
      {prices.failed.length > 0 && (
        <p className="banner banner--error">
          Keine Kursdaten gefunden für: {prices.failed.join(', ')}. Prüfe die Symbole.
        </p>
      )}

      <section className="app-section">
        <KpiRow value={totalValue} invested={totalInvested} />
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

      <section className="app-section">
        <h2>Kursverlauf</h2>
        <TickerChart
          symbols={symbols}
          seriesBySymbol={prices.series}
          transactions={transactions}
          instruments={instruments}
        />
      </section>

      <section className="app-section">
        <h2>Transaktion erfassen</h2>
        <TransactionForm
          instruments={instruments}
          transactions={transactions}
          apiKey={settings.apiKey}
          onAdd={store.addTransaction}
          onUpsertInstrument={store.upsertInstrument}
        />
      </section>

      <section className="app-section">
        <h2>Transaktionen</h2>
        <TransactionList transactions={transactions} instruments={instruments} onRemove={store.removeTransaction} />
      </section>
    </div>
  )
}

export default App
