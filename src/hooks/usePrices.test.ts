import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrices } from './usePrices'
import type { PriceCacheResult } from '../data/priceCache'

vi.mock('../data/priceCache', () => ({ getSeries: vi.fn() }))
const { getSeries } = await import('../data/priceCache')
const getSeriesMock = vi.mocked(getSeries)

function result(overrides: Partial<PriceCacheResult> = {}): PriceCacheResult {
  return { series: {}, rateLimited: [], failed: [], ...overrides }
}

beforeEach(() => {
  getSeriesMock.mockReset()
})

describe('usePrices', () => {
  it('stays idle and never calls getSeries without an API key', async () => {
    const { result: hook } = renderHook(() => usePrices(['SAP.DEX'], undefined))

    expect(hook.current.status).toBe('idle')
    expect(getSeriesMock).not.toHaveBeenCalled()
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

  it('passes through rateLimited and failed symbols', async () => {
    getSeriesMock.mockResolvedValue(result({ rateLimited: ['SAP.DEX'], failed: ['BOGUS'] }))

    const { result: hook } = renderHook(() => usePrices(['SAP.DEX', 'BOGUS'], 'demo-key'))

    await waitFor(() => expect(hook.current.status).toBe('ready'))
    expect(hook.current.rateLimited).toEqual(['SAP.DEX'])
    expect(hook.current.failed).toEqual(['BOGUS'])
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
