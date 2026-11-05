import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { parsePage, useHashPage } from './useHashPage'

beforeEach(() => {
  window.location.hash = ''
})

describe('parsePage', () => {
  it('parses known pages', () => {
    expect(parsePage('#/markt')).toBe('markt')
    expect(parsePage('#/transaktionen')).toBe('transaktionen')
    expect(parsePage('#/uebersicht')).toBe('uebersicht')
  })

  it('falls back to the overview for empty or unknown hashes', () => {
    expect(parsePage('')).toBe('uebersicht')
    expect(parsePage('#/nope')).toBe('uebersicht')
  })
})

describe('useHashPage', () => {
  it('follows hashchange events', () => {
    const { result } = renderHook(() => useHashPage())
    expect(result.current[0]).toBe('uebersicht')

    act(() => {
      window.location.hash = '#/markt'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current[0]).toBe('markt')
  })

  it('setPage writes the hash', () => {
    const { result } = renderHook(() => useHashPage())
    act(() => result.current[1]('transaktionen'))
    expect(window.location.hash).toBe('#/transaktionen')
  })
})
