// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement, Fragment } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActionResult } from '@/lib/errors'

type Result = ActionResult<unknown>

const show = vi.fn()
const withdraw = vi.fn()
const updateProfileAction = vi.fn()
const setDevicePrefsAction = vi.fn()

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/app/(frontend)/actions/account', () => ({ updateProfileAction }))
vi.mock('@/app/(frontend)/actions/prefs', () => ({ setDevicePrefsAction }))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss: vi.fn(), withdraw }),
}))

const { VisibilitySwitch } = await import('@/app/(frontend)/(sections)/settings/VisibilitySwitch')
const { ThemeSwitch } = await import('@/app/(frontend)/(sections)/settings/ThemeSwitch')

const ok: Result = { ok: true, data: null }
const failed: Result = { ok: false, code: 'NO_CONNECTION' }

/** Each action call waits until the test settles it. */
const calls: ((result: Result) => void)[] = []
const deferred = () => new Promise<Result>((resolve) => calls.push(resolve))
updateProfileAction.mockImplementation(deferred)
setDevicePrefsAction.mockImplementation(deferred)
const settle = (call: number, result: Result) => act(async () => calls[call](result))

type Props = Parameters<typeof VisibilitySwitch>[0]

// Three options, so a revert to the value shown at tap time differs from the stored one.
const visibility = (field: Props['field']) =>
  createElement(VisibilitySwitch, {
    field,
    label: field,
    headingId: 'heading',
    initial: 'a',
    options: ['a', 'b', 'c'],
  } as unknown as Props)

const mount = (field: Props['field']) => render(visibility(field))

const tap = (option: string, index = 0) =>
  fireEvent.click(screen.getAllByRole('button', { name: `visibilities.${option}` })[index])

const shown = (index = 0) =>
  screen.getAllByRole('button', { pressed: true })[index].textContent?.replace('visibilities.', '')

describe('Visibility switch (useSavedSwitch)', () => {
  afterEach(() => {
    cleanup()
    calls.length = 0
    show.mockReset()
    withdraw.mockReset()
  })

  it('b, c; b fails while c is in flight, then c ok: shows c throughout, no toast', async () => {
    mount('profileVisibility')
    tap('b')
    tap('c')
    await settle(0, failed)
    expect(shown()).toBe('c')
    expect(show).not.toHaveBeenCalled()
    await settle(1, ok)
    expect(shown()).toBe('c')
  })

  it('b, c; c ok, then b fails: shows c, no toast', async () => {
    mount('profileVisibility')
    tap('b')
    tap('c')
    expect(shown()).toBe('c')
    await settle(1, ok)
    expect(shown()).toBe('c')
    await settle(0, failed)
    expect(shown()).toBe('c')
    expect(show).not.toHaveBeenCalled()
  })

  it('b, c; c ok, then b ok: the older success does not replace c', async () => {
    mount('profileVisibility')
    tap('b')
    tap('c')
    await settle(1, ok)
    await settle(0, ok)
    expect(shown()).toBe('c')
  })

  it("b, c; c fails, then b ok: c until b settles, then b; c's error stays", async () => {
    show.mockReturnValue(7)
    mount('profileVisibility')
    tap('b')
    tap('c')
    await settle(1, failed)
    expect(shown()).toBe('c')
    expect(show).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' })
    await settle(0, ok)
    expect(shown()).toBe('b')
    expect(withdraw).not.toHaveBeenCalled()
  })

  it('b ok; c fails: shows b, with the error', async () => {
    mount('profileVisibility')
    tap('b')
    await settle(0, ok)
    tap('c')
    await settle(1, failed)
    expect(shown()).toBe('b')
    expect(show).toHaveBeenCalledTimes(1)
  })

  it("c fails; c again ok: shows c and withdraws c's error", async () => {
    show.mockReturnValue(7)
    mount('profileVisibility')
    tap('c')
    await settle(0, failed)
    expect(shown()).toBe('a')
    tap('c')
    await settle(1, ok)
    expect(shown()).toBe('c')
    expect(withdraw).toHaveBeenCalledExactlyOnceWith(7)
  })

  it("a retry withdraws only its own switch's error, by that error's id", async () => {
    show.mockReturnValueOnce(1).mockReturnValueOnce(2)
    mount('profileVisibility')
    mount('collectionVisibility')
    tap('c', 0)
    await settle(0, failed)
    tap('c', 1)
    await settle(1, failed)
    tap('c', 0)
    await settle(2, ok)
    expect(shown(0)).toBe('c')
    expect(withdraw).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('names the group by its own label, then the Visibility heading', () => {
    render(
      createElement(
        Fragment,
        null,
        createElement('h2', { id: 'heading' }, 'visibility'),
        visibility('profileVisibility'),
      ),
    )
    expect(screen.getByRole('group', { name: 'profileVisibility visibility' })).toBeTruthy()
  })
})

describe('Theme switch', () => {
  afterEach(() => {
    cleanup()
    calls.length = 0
    show.mockReset()
  })

  it('sets data-theme at the tap and returns it when the save fails', async () => {
    document.documentElement.dataset.theme = 'system'
    render(createElement(ThemeSwitch, { initial: 'system', options: ['light', 'dark', 'system'] }))
    fireEvent.click(screen.getByRole('button', { name: 'themes.dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    await settle(0, failed)
    expect(document.documentElement.dataset.theme).toBe('system')
  })
})
