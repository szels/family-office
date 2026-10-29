import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TransactionForm } from './TransactionForm'
import type { Transaction } from '../domain/types'

function renderForm(transactions: Transaction[] = []) {
  const onAdd = vi.fn()
  const onUpsertInstrument = vi.fn()
  render(
    <TransactionForm
      instruments={{}}
      transactions={transactions}
      apiKey={undefined}
      onAdd={onAdd}
      onUpsertInstrument={onUpsertInstrument}
    />,
  )
  return { onAdd, onUpsertInstrument }
}

function fillCommonFields(quantity: string, price: string) {
  fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: 'SAP.DEX' } })
  fireEvent.change(screen.getByLabelText('Stück'), { target: { value: quantity } })
  fireEvent.change(screen.getByLabelText('Preis pro Stück (€)'), { target: { value: price } })
}

describe('TransactionForm', () => {
  it('rejects a sell dated before the matching buy, using the holding on that date', () => {
    // Bought 10 units on 2026-03-01. A sell is entered dated 2026-01-01,
    // before any units were held — today's holding (10) must not be used
    // to validate it.
    const { onAdd } = renderForm([
      { id: 'buy-1', type: 'buy', symbol: 'SAP.DEX', date: '2026-03-01', quantity: 10, price: 100, fees: 0 },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Verkauf' }))
    fillCommonFields('5', '120')
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verkauf erfassen' }))

    expect(screen.getByText(/Verkauf übersteigt den Bestand am 01\.01\.2026/)).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('accepts a sell that is within the holding on its own date', () => {
    const { onAdd } = renderForm([
      { id: 'buy-1', type: 'buy', symbol: 'SAP.DEX', date: '2026-01-01', quantity: 10, price: 100, fees: 0 },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Verkauf' }))
    fillCommonFields('5', '120')
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verkauf erfassen' }))

    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('does not let an unrelated bad transaction in another symbol block a valid entry', () => {
    const { onAdd } = renderForm([
      { id: 'bad', type: 'sell', symbol: 'EUNL.DEX', date: '2026-01-01', quantity: 5, price: 50, fees: 0 },
    ])

    fillCommonFields('1', '100') // buy, default type
    fireEvent.click(screen.getByRole('button', { name: 'Kauf erfassen' }))

    expect(onAdd).toHaveBeenCalledOnce()
  })
})
