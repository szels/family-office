import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, formatPercent, formatQuantity } from './format'

describe('formatCurrency', () => {
  it('formats a positive amount as German-locale EUR', () => {
    expect(formatCurrency(1234.5)).toBe('1.234,50 €')
  })

  it('formats a negative amount with a leading minus', () => {
    expect(formatCurrency(-99.9)).toBe('-99,90 €')
  })
})

describe('formatPercent', () => {
  it('formats a fraction as a percentage with one decimal', () => {
    expect(formatPercent(0.224)).toBe('22,4 %')
  })

  it('keeps the sign for a loss', () => {
    expect(formatPercent(-0.05)).toBe('-5,0 %')
  })
})

describe('formatQuantity', () => {
  it('formats whole numbers without decimals', () => {
    expect(formatQuantity(10)).toBe('10')
  })

  it('keeps fractional shares with up to 4 decimals', () => {
    expect(formatQuantity(1.5)).toBe('1,5')
    expect(formatQuantity(0.1234)).toBe('0,1234')
  })
})

describe('formatDate', () => {
  it('formats an ISO date as German dd.mm.yyyy', () => {
    expect(formatDate('2026-03-01')).toBe('01.03.2026')
  })
})
