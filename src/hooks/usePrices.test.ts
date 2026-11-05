import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrices } from './usePrices'
import type { PriceCacheResult } from '../data/priceCache'

vi.mock('../data/priceCache', () => ({ getSeries: vi.fn() }))
const { getSeries } = await import('../data/priceCache')
const getSeriesMock = vi.mocked(getSeries)

function result(overrides: Partial<PriceCacheResult> = {}): PriceCacheResult {
  return { series: {}, rateLimited: [], failed: [], unavailable: [], ...overrides }
}

beforeEach(() => {
  getSeriesMock.mockReset()
})

describe('usePrices', () => {
  it('loads without an API key, since stocks and ETFs come from a keyless source', async () => {
    getSeriesMock.mockResolvedValue(result({ series: { 'SAP.DEX': [{ date: '2026-02-27', close: 123 }] } }))

    const { result: hook } = renderHook(() => usePrices(['SAP.DEX'], undefined))

    await waitFor(() => expect(hook.current.status).toBe('ready'))
    expect(getSeriesMock).toHaveBeenCalledWith(['SAP.DEX'], undefined, undefined, {})
  })

  it('stays idle without symbols', () => {
    const { result: hook } = renderHook(() => usePrices([], 'demo-key'))

    expect(hook.current.status).toBe('idle')
    expect(getSeriesMock).not.toHaveBeenCalled()
  })

  it('passes hints through and does not refetch for an equal hints object', async () => {
    getSeriesMock.mockResolvedValue(result())

    const { rerender } = renderHook(({ hints }) => usePrices(['SAP.DEX'], undefined, hints), {
      initialProps: { hints: { 'SAP.DEX': { kind: 'stock' as const, since: '2025-01-01' } } },
    })
    await waitFor(() => expect(getSeriesMock).toHaveBeenCalledTimes(1))
    expect(getSeriesMock).toHaveBeenCalledWith(['SAP.DEX'], undefined, undefined, {
      'SAP.DEX': { kind: 'stock', since: '2025-01-01' },
    })

    rerender({ hints: { 'SAP.DEX': { kind: 'stock' as const, since: '2025-01-01' } } })

    expect(getSeriesMock).toHaveBeenCalledTimes(1)
  })

  it('fetches series for the given symbols and derives the latest close per symbol', async () => {
    getSeriesMock.mockResolvedValue(
      result({
        series: {
          'SAP.DEX': [
            { date: '2026-02-20', close: 120 },
            { date: '2026-02-27', close: 123 },
          ],
        },
      }),
    )

    const { result: hook } = renderHook(() => usePrices(['SAP.DEX'], 'demo-key'))

    await waitFor(() => expect(hook.current.status).toBe('ready'))
    expect(hook.current.latestPrices).toEqual({ 'SAP.DEX': 123 })
  })

  it('passes through rateLimited, failed and unavailable symbols', async () => {
    getSeriesMock.mockResolvedValue(result({ rateLimited: ['SAP.DEX'], failed: ['BOGUS'], unavailable: ['XAU'] }))

    const { result: hook } = renderHook(() => usePrices(['SAP.DEX', 'BOGUS'], 'demo-key'))

    await waitFor(() => expect(hook.current.status).toBe('ready'))
    expect(hook.current.rateLimited).toEqual(['SAP.DEX'])
    expect(hook.current.failed).toEqual(['BOGUS'])
    expect(hook.current.unavailable).toEqual(['XAU'])
  })

  it('sets an error status when getSeries rejects unexpectedly', async () => {
    getSeriesMock.mockRejectedValue(new Error('network down'))

    const { result: hook } = renderHook(() => usePrices(['SAP.DEX'], 'demo-key'))

    await waitFor(() => expect(hook.current.status).toBe('error'))
  })

  it('does not refetch when rerendered with a new array containing the same symbols', async () => {
    getSeriesMock.mockResolvedValue(result())

    const { rerender } = renderHook(({ symbols }) => usePrices(symbols, 'demo-key'), {
      initialProps: { symbols: ['SAP.DEX'] },
    })
    await waitFor(() => expect(getSeriesMock).toHaveBeenCalledTimes(1))

    rerender({ symbols: ['SAP.DEX'] }) // new array, same contents

    expect(getSeriesMock).toHaveBeenCalledTimes(1)
  })
})
