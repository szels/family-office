import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayIso } from './date'

afterEach(() => {
  vi.useRealTimers()
})

describe('todayIso', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 2026-03-01 23:30 in UTC+1 is still 2026-03-01 local, but already
    // 2026-03-02 in UTC — exactly the German-evening edge case that a
    // `toISOString()`-based "today" gets wrong.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T22:30:00Z')) // 23:30 CET (UTC+1)
    vi.stubEnv('TZ', 'Europe/Berlin')

    expect(todayIso()).toBe('2026-03-01')
  })

  it('zero-pads single-digit months and days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T10:00:00Z'))
    vi.stubEnv('TZ', 'Europe/Berlin')

    expect(todayIso()).toBe('2026-01-05')
  })
})
