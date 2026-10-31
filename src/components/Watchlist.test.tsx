import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Watchlist } from './Watchlist'
import type { WatchlistEntry } from '../domain/types'

vi.mock('../data/onvista', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/onvista')>()
  return { ...actual, searchSecurity: vi.fn() }
})
const { searchSecurity } = await import('../data/onvista')
const searchSecurityMock = vi.mocked(searchSecurity)

const eunl: WatchlistEntry = {
  symbol: 'EUNL.DEX',
  name: 'iShares Core MSCI World UCITS ETF USD Acc.',
  isin: 'IE00B4L5Y983',
  wkn: 'A0RPWH',
  kind: 'etf',
  addedAt: '2026-02-01',
}

beforeEach(() => {
  searchSecurityMock.mockReset()
})

function renderWatchlist(entries: WatchlistEntry[] = []) {
  const onAdd = vi.fn()
  const onRemove = vi.fn()
  render(<Watchlist entries={entries} seriesBySymbol={{}} onAdd={onAdd} onRemove={onRemove} />)
  return { onAdd, onRemove }
}

describe('Watchlist', () => {
  it('shows an empty-state hint when nothing is on the watchlist', () => {
    renderWatchlist([])
    expect(screen.getByText(/Noch keine Wertpapiere/)).toBeInTheDocument()
  })

  it('rejects a query that is neither ISIN nor WKN shaped, without calling the API', async () => {
    renderWatchlist([])

    fireEvent.change(screen.getByPlaceholderText('ISIN oder WKN'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suchen' }))

    expect(await screen.findByText(/ISIN oder WKN/)).toBeInTheDocument()
    expect(searchSecurityMock).not.toHaveBeenCalled()
  })

  it('searches by ISIN/WKN and lets the user add a match', async () => {
    searchSecurityMock.mockResolvedValue([
      { symbol: 'EUNL.DEX', name: eunl.name, isin: eunl.isin, wkn: eunl.wkn, kind: 'etf' },
    ])
    const { onAdd } = renderWatchlist([])

    fireEvent.change(screen.getByPlaceholderText('ISIN oder WKN'), { target: { value: eunl.wkn } })
    fireEvent.click(screen.getByRole('button', { name: 'Suchen' }))

    expect(await screen.findByText(eunl.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'EUNL.DEX', isin: eunl.isin, wkn: eunl.wkn, kind: 'etf' }),
    )
  })

  it('shows an error when the search fails', async () => {
    searchSecurityMock.mockRejectedValue(new Error('boom'))
    renderWatchlist([])

    fireEvent.change(screen.getByPlaceholderText('ISIN oder WKN'), { target: { value: eunl.wkn } })
    fireEvent.click(screen.getByRole('button', { name: 'Suchen' }))

    expect(await screen.findByText(/Suche fehlgeschlagen/)).toBeInTheDocument()
  })

  it('shows no match found message when the search returns nothing', async () => {
    searchSecurityMock.mockResolvedValue([])
    renderWatchlist([])

    fireEvent.change(screen.getByPlaceholderText('ISIN oder WKN'), { target: { value: eunl.wkn } })
    fireEvent.click(screen.getByRole('button', { name: 'Suchen' }))

    expect(await screen.findByText(/Kein Treffer/)).toBeInTheDocument()
  })

  it('lists existing entries and shows a dash where no price is cached yet', () => {
    renderWatchlist([eunl])

    expect(screen.getByText(eunl.name)).toBeInTheDocument()
    expect(screen.getByText('EUNL.DEX')).toBeInTheDocument()
    expect(screen.getByText(`${eunl.isin} · ${eunl.wkn}`)).toBeInTheDocument()
    expect(screen.getAllByText('–').length).toBeGreaterThan(0)
  })

  it('removes an entry', () => {
    const { onRemove } = renderWatchlist([eunl])

    fireEvent.click(screen.getByRole('button', { name: `Symbol ${eunl.symbol} entfernen` }))

    expect(onRemove).toHaveBeenCalledWith(eunl.symbol)
  })

  it('disables adding a match that is already on the watchlist', async () => {
    searchSecurityMock.mockResolvedValue([
      { symbol: 'EUNL.DEX', name: eunl.name, isin: eunl.isin, wkn: eunl.wkn, kind: 'etf' },
    ])
    renderWatchlist([eunl])

    fireEvent.change(screen.getByPlaceholderText('ISIN oder WKN'), { target: { value: eunl.wkn } })
    fireEvent.click(screen.getByRole('button', { name: 'Suchen' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Bereits beobachtet' })).toBeDisabled())
  })
})
