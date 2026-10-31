import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TickerChart } from './TickerChart'
import type { Transaction } from '../domain/types'

const buy: Transaction = {
  id: 'tx-1',
  type: 'buy',
  symbol: 'SAP.DEX',
  date: '2026-01-10',
  quantity: 10,
  price: 100,
  fees: 0,
}

describe('TickerChart', () => {
  it('enables removing a symbol that has no transactions', () => {
    const onRemoveSymbol = vi.fn()
    render(
      <TickerChart
        symbols={['BOGUS']}
        seriesBySymbol={{}}
        transactions={[]}
        instruments={{}}
        onRemoveSymbol={onRemoveSymbol}
      />,
    )

    const button = screen.getByRole('button', { name: /BOGUS entfernen/i })
    expect(button).toBeEnabled()

    fireEvent.click(button)

    expect(onRemoveSymbol).toHaveBeenCalledWith('BOGUS')
  })

  it('disables removing a symbol that still has transactions', () => {
    render(
      <TickerChart
        symbols={['SAP.DEX']}
        seriesBySymbol={{}}
        transactions={[buy]}
        instruments={{}}
        onRemoveSymbol={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /SAP.DEX entfernen/i })).toBeDisabled()
  })
})
