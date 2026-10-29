import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionForm } from './TransactionForm'
import type { Transaction } from '../domain/types'

vi.mock('../data/alphaVantage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/alphaVantage')>()
  return { ...actual, searchSymbol: vi.fn() }
})
const { searchSymbol } = await import('../data/alphaVantage')
const searchSymbolMock = vi.mocked(searchSymbol)

beforeEach(() => {
  searchSymbolMock.mockReset()
})

function renderForm(
  transactions: Transaction[] = [],
  apiKey: string | undefined = undefined,
  editingTransaction?: Transaction,
) {
  const onAdd = vi.fn()
  const onUpdate = vi.fn()
  const onUpsertInstrument = vi.fn()
  const onCancelEdit = vi.fn()
  render(
    <TransactionForm
      instruments={{}}
      transactions={transactions}
      apiKey={apiKey}
      editingTransaction={editingTransaction}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onUpsertInstrument={onUpsertInstrument}
      onCancelEdit={onCancelEdit}
    />,
  )
  return { onAdd, onUpdate, onUpsertInstrument, onCancelEdit }
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

  it('pressing Enter in the symbol-search box searches instead of submitting the transaction', () => {
    searchSymbolMock.mockResolvedValue([])
    const { onAdd } = renderForm([], 'demo-key')

    const searchInput = screen.getByPlaceholderText('Wertpapier suchen (Name oder Symbol)')
    fireEvent.change(searchInput, { target: { value: 'SAP' } })
    fireEvent.keyDown(searchInput, { key: 'Enter' })

    expect(searchSymbolMock).toHaveBeenCalledWith('SAP', 'demo-key')
    expect(onAdd).not.toHaveBeenCalled()
  })

  describe('editing an existing transaction', () => {
    const existing: Transaction = {
      id: 'tx-1',
      type: 'buy',
      symbol: 'SAP.DEX',
      date: '2026-01-10',
      quantity: 10,
      price: 100,
      fees: 0,
    }

    it('prefills the form fields and labels the submit button for editing', () => {
      renderForm([existing], undefined, existing)

      expect(screen.getByLabelText('Symbol')).toHaveValue('SAP.DEX')
      expect(screen.getByLabelText('Stück')).toHaveValue(10)
      expect(screen.getByLabelText('Preis pro Stück (€)')).toHaveValue(100)
      expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeInTheDocument()
    })

    it('saves via onUpdate with the same id instead of onAdd', () => {
      const { onAdd, onUpdate } = renderForm([existing], undefined, existing)

      fireEvent.change(screen.getByLabelText('Preis pro Stück (€)'), { target: { value: '120' } })
      fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

      expect(onAdd).not.toHaveBeenCalled()
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1', price: 120 }))
    })

    it('rejects shrinking a buy below what a later sell already consumed', () => {
      // Bought 10 on day 1, sold all 10 on day 2 — valid as it stands.
      // Editing the buy down to 5 must be rejected: the sell would break.
      const sell: Transaction = {
        id: 'tx-2',
        type: 'sell',
        symbol: 'SAP.DEX',
        date: '2026-02-01',
        quantity: 10,
        price: 120,
        fees: 0,
      }
      const { onUpdate } = renderForm([existing, sell], undefined, existing)

      fireEvent.change(screen.getByLabelText('Stück'), { target: { value: '5' } })
      fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }))

      expect(onUpdate).not.toHaveBeenCalled()
      expect(screen.getByText(/Verkauf übersteigt den Bestand/)).toBeInTheDocument()
    })

    it('cancelling calls onCancelEdit without saving and clears the fields', () => {
      const { onAdd, onUpdate, onCancelEdit } = renderForm([existing], undefined, existing)

      fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

      expect(onCancelEdit).toHaveBeenCalledOnce()
      expect(onAdd).not.toHaveBeenCalled()
      expect(onUpdate).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Symbol')).toHaveValue('')
    })
  })
})
