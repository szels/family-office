import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { saveTransactions } from './data/storage'

beforeEach(() => {
  localStorage.clear()
})

// React logs an "Uncaught [RangeError]" dev-mode console.error for the
// render-error case below; that's the bug under test, already asserted on
// via the banner, so silence it rather than letting it clutter test output.
vi.spyOn(console, 'error').mockImplementation(() => {})

describe('App', () => {
  it('shows a banner instead of crashing when stored data is inconsistent', () => {
    // A sell with nothing bought first — e.g. the matching buy was deleted,
    // or a sell was imported dated before its buy. Must not brick the app.
    saveTransactions([
      { id: 'bad-sell', type: 'sell', symbol: 'SAP.DEX', date: '2026-01-01', quantity: 5, price: 100, fees: 0 },
    ])

    render(<App />)

    expect(screen.getByText(/Datenfehler/i)).toBeInTheDocument()
  })

  it('still renders the rest of the dashboard when history data is inconsistent', () => {
    saveTransactions([
      { id: 'bad-sell', type: 'sell', symbol: 'SAP.DEX', date: '2026-01-01', quantity: 5, price: 100, fees: 0 },
    ])

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Mein Depot' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Transaktionen' })).toBeInTheDocument()
  })
})
