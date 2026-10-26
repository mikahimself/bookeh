import { describe, expect, it } from 'vitest'

import { helsinkiToday, isCalendarDate } from '@/lib/loans/dates'

describe('helsinkiToday', () => {
  it.each([
    ['winter, before midnight', '2026-10-26T21:59:59Z', '2026-10-26'],
    ['winter, at midnight', '2026-10-26T22:00:00Z', '2026-10-27'],
    ['summer, before midnight', '2026-07-01T20:59:59Z', '2026-07-01'],
    ['summer, at midnight', '2026-07-01T21:00:00Z', '2026-07-02'],
  ])('gives the Helsinki date %s', (_, instant, expected) => {
    expect(helsinkiToday(new Date(instant))).toBe(expected)
  })
})

describe('isCalendarDate', () => {
  it.each(['2026-10-26', '2024-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true)
  })

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '26.10.2026',
    '2026-1-01',
    '2026-10-26T12:00:00.000Z',
    '',
    20261026,
    null,
    undefined,
  ])('refuses %j', (value) => {
    expect(isCalendarDate(value)).toBe(false)
  })
})
