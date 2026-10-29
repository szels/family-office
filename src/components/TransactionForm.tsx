import { useId, useState } from 'react'
import { searchSymbol, type SymbolMatch } from '../data/alphaVantage'
import { computePositions } from '../domain/portfolio'
import type { Instrument, InstrumentKind, Transaction, TransactionType } from '../domain/types'
import { formatDate, formatQuantity } from '../lib/format'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface TransactionFormProps {
  instruments: Record<string, Instrument>
  transactions: Transaction[]
  apiKey: string | undefined
  onAdd: (transaction: Transaction) => void
  onUpsertInstrument: (symbol: string, instrument: Instrument) => void
}

export function TransactionForm({
  instruments,
  transactions,
  apiKey,
  onAdd,
  onUpsertInstrument,
}: TransactionFormProps) {
  const formId = useId()
  const [type, setType] = useState<TransactionType>('buy')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<InstrumentKind>('stock')
  const [date, setDate] = useState(todayIso())
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('0')
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SymbolMatch[]>([])
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  function reset() {
    setSymbol('')
    setName('')
    setKind('stock')
    setQuantity('')
    setPrice('')
    setFees('0')
    setSearchResults([])
    setSearchQuery('')
  }

  async function handleSearch() {
    if (!apiKey || searchQuery.trim() === '') return
    setSearchStatus('loading')
    try {
      const matches = await searchSymbol(searchQuery.trim(), apiKey)
      setSearchResults(matches.filter((m) => m.currency === 'EUR'))
      setSearchStatus('idle')
    } catch {
      setSearchStatus('error')
    }
  }

  function pickMatch(match: SymbolMatch) {
    setSymbol(match.symbol)
    setName(match.name)
    setSearchResults([])
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmedSymbol = symbol.trim().toUpperCase()
    const parsedQuantity = Number.parseFloat(quantity)
    const parsedPrice = Number.parseFloat(price)
    const parsedFees = Number.parseFloat(fees || '0')

    if (trimmedSymbol === '') {
      setError('Bitte ein Symbol angeben, z. B. SAP.DEX.')
      return
    }
    if (!date) {
      setError('Bitte ein Datum angeben.')
      return
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Die Stückzahl muss größer als 0 sein.')
      return
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('Der Preis muss größer als 0 sein.')
      return
    }
    if (!Number.isFinite(parsedFees) || parsedFees < 0) {
      setError('Die Gebühren dürfen nicht negativ sein.')
      return
    }

    const candidate: Transaction = {
      id: crypto.randomUUID(),
      type,
      symbol: trimmedSymbol,
      date,
      quantity: parsedQuantity,
      price: parsedPrice,
      fees: parsedFees,
    }

    if (type === 'sell') {
      // Validate against the holding ON THE TRANSACTION'S OWN DATE, not
      // today's — a back-dated sell could otherwise pass this check against
      // today's larger holding and only fail later, deep inside
      // computePositions/buildHistory. Scoped to this symbol's own
      // transactions so an unrelated bad transaction elsewhere can't block
      // an otherwise-valid entry.
      const sameSymbol = transactions.filter((tx) => tx.symbol === trimmedSymbol)
      try {
        computePositions([...sameSymbol, candidate], {})
      } catch (err) {
        if (!(err instanceof RangeError)) throw err
        const heldAsOfDate =
          computePositions(sameSymbol.filter((tx) => tx.date <= date), {})[0]?.quantity ?? 0
        setError(
          `Verkauf übersteigt den Bestand am ${formatDate(date)} (gehalten: ${formatQuantity(heldAsOfDate)}).`,
        )
        return
      }
    }

    onAdd(candidate)

    if (!instruments[trimmedSymbol] || name.trim() !== '') {
      onUpsertInstrument(trimmedSymbol, { name: name.trim() || trimmedSymbol, kind })
    }

    reset()
  }

  return (
    <form className="transaction-form" onSubmit={handleSubmit}>
      <div className="transaction-form-grid">
        <div className="field field--type">
          <span className="field-label">Art</span>
          <div className="segmented" role="radiogroup" aria-label="Transaktionsart">
            <button
              type="button"
              className={type === 'buy' ? 'segmented-option segmented-option--active' : 'segmented-option'}
              aria-pressed={type === 'buy'}
              onClick={() => setType('buy')}
            >
              Kauf
            </button>
            <button
              type="button"
              className={type === 'sell' ? 'segmented-option segmented-option--active' : 'segmented-option'}
              aria-pressed={type === 'sell'}
              onClick={() => setType('sell')}
            >
              Verkauf
            </button>
          </div>
        </div>

        <div className="field field--symbol">
          <label htmlFor={`${formId}-symbol`} className="field-label">
            Symbol
          </label>
          <div className="symbol-row">
            <input
              id={`${formId}-symbol`}
              className="num"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="z. B. SAP.DEX"
              list={`${formId}-known-symbols`}
            />
            <datalist id={`${formId}-known-symbols`}>
              {Object.keys(instruments).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${formId}-name`} className="field-label">
            Name
          </label>
          <input id={`${formId}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. SAP SE" />
        </div>

        <div className="field">
          <label htmlFor={`${formId}-kind`} className="field-label">
            Art des Wertpapiers
          </label>
          <select id={`${formId}-kind`} value={kind} onChange={(e) => setKind(e.target.value as InstrumentKind)}>
            <option value="stock">Aktie</option>
            <option value="etf">ETF</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${formId}-date`} className="field-label">
            Datum
          </label>
          <input
            id={`${formId}-date`}
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${formId}-quantity`} className="field-label">
            Stück
          </label>
          <input
            id={`${formId}-quantity`}
            className="num"
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${formId}-price`} className="field-label">
            Preis pro Stück (€)
          </label>
          <input
            id={`${formId}-price`}
            className="num"
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${formId}-fees`} className="field-label">
            Gebühren (€)
          </label>
          <input
            id={`${formId}-fees`}
            className="num"
            type="number"
            min="0"
            step="any"
            value={fees}
            onChange={(e) => setFees(e.target.value)}
          />
        </div>
      </div>

      {apiKey && (
        <div className="symbol-search">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Wertpapier suchen (Name oder Symbol)"
          />
          <button type="button" onClick={handleSearch} disabled={searchStatus === 'loading'}>
            {searchStatus === 'loading' ? 'Suche…' : 'Suchen'}
          </button>
          {searchStatus === 'error' && <p className="form-error">Suche fehlgeschlagen.</p>}
          {searchResults.length > 0 && (
            <ul className="symbol-results">
              {searchResults.map((match) => (
                <li key={match.symbol}>
                  <button type="button" onClick={() => pickMatch(match)}>
                    <span className="num">{match.symbol}</span> — {match.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <button type="submit" className="primary-button">
        {type === 'buy' ? 'Kauf erfassen' : 'Verkauf erfassen'}
      </button>
    </form>
  )
}
