import { describe, expect, it } from 'vitest'

import { readingLine, sinceDay, unreadFor } from '@/app/(frontend)/(sections)/readingLine'

const today = '2026-11-06'

describe('readingLine (FR-54)', () => {
  it('picks the case and counts calendar days, at least one', () => {
    const line = (state: 'unread' | 'reading' | 'read', since: string | null, at: string | null) =>
      readingLine({ state, readingSince: since, finishedAt: at }, today)

    expect(line('unread', null, null)).toEqual({ kind: 'none' })
    expect(line('reading', today, null)).toEqual({ kind: 'since', start: today, days: 1 })
    expect(line('reading', '2026-10-21', null)).toEqual({
      kind: 'since',
      start: '2026-10-21',
      days: 16,
    })
    expect(line('read', '2026-10-21', '2026-11-05')).toEqual({
      kind: 'range',
      start: '2026-10-21',
      finish: '2026-11-05',
      days: 15,
    })
    expect(line('read', '2026-10-21', null)).toEqual({ kind: 'started', start: '2026-10-21' })
    expect(line('read', null, '2026-11-05')).toEqual({ kind: 'finished', finish: '2026-11-05' })
    expect(line('read', null, null)).toEqual({ kind: 'addDates' })
  })
})

describe('unreadFor (FR-58, Most dust collected)', () => {
  it.each([
    ['2014-05-01', { unit: 'years', n: 12 }],
    ['2026-01-07', { unit: 'months', n: 10 }],
    ['2026-10-20', { unit: 'days', n: 18 }],
    ['2026-11-07', { unit: 'days', n: 1 }],
    ['2025-11-08', { unit: 'months', n: 11 }],
    ['2025-11-07', { unit: 'years', n: 1 }],
  ] as const)('since %s is %o', (since, expected) => {
    expect(unreadFor(since, '2026-11-07')).toEqual(expected)
  })
})

describe('sinceDay', () => {
  it('adds the year only when it is not this year', () => {
    expect(sinceDay('2026-10-02', '2026-11-07')).toEqual({ day: 'numeric', month: 'short' })
    expect(sinceDay('2025-12-30', '2026-11-07')).toEqual({
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  })
})
