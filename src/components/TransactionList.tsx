import type { Instrument, Transaction } from '../domain/types'
import { formatCurrency, formatDate, formatQuantity } from '../lib/format'

interface TransactionListProps {
  transactions: Transaction[]
  instruments: Record<string, Instrument>
  onRemove: (id: string) => void
}

export function TransactionList({ transactions, instruments, onRemove }: TransactionListProps) {
  if (transactions.length === 0) {
    return <p className="empty-hint">Noch keine Transaktionen erfasst.</p>
  }

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <table className="transaction-list">
      <thead>
        <tr>
          <th scope="col">Datum</th>
          <th scope="col">Art</th>
          <th scope="col">Position</th>
          <th scope="col">Stück</th>
          <th scope="col">Preis</th>
          <th scope="col">Gebühren</th>
          <th scope="col"></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((tx) => (
          <tr key={tx.id}>
            <td className="num">{formatDate(tx.date)}</td>
            <td className={tx.type === 'buy' ? 'tx-type tx-type--buy' : 'tx-type tx-type--sell'}>
              {tx.type === 'buy' ? 'Kauf' : 'Verkauf'}
            </td>
            <th scope="row">
              <span className="position-symbol">{tx.symbol}</span>
              {instruments[tx.symbol]?.name && <span className="position-name">{instruments[tx.symbol].name}</span>}
            </th>
            <td className="num">{formatQuantity(tx.quantity)}</td>
            <td className="num">{formatCurrency(tx.price)}</td>
            <td className="num">{formatCurrency(tx.fees)}</td>
            <td>
              <button type="button" className="icon-button" onClick={() => onRemove(tx.id)} aria-label="Transaktion löschen">
                Löschen
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
