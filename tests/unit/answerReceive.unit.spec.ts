// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const router = { refresh: vi.fn(), replace: vi.fn() }
const show = vi.fn()
const dismiss = vi.fn()
const receiveCopyAction = vi.fn()

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const { default: messages } = await import('../../messages/en.json')
  return {
    ...actual,
    useTranslations: (namespace?: string) =>
      actual.createTranslator({ locale: 'en', messages, namespace: namespace as 'sources' }),
  }
})
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => router,
}))
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({
  useToast: () => ({ show, dismiss }),
}))
vi.mock('@/app/(frontend)/(sections)/actions', () => ({ receiveCopyAction }))

const { AnswerReceive } = await import('@/app/(frontend)/scan/AnswerReceive')

const press = async () => {
  render(createElement(AnswerReceive, { copyId: 21 }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Received' })))
}

describe("the Answer's Received Link", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("receives that copy and toasts where it landed, with the receipt's Undo", async () => {
    receiveCopyAction.mockResolvedValue({
      ok: true,
      data: { savedTo: { id: 9, name: 'Tampere' }, undoToken: 'tok', undoSeconds: 8 },
    })

    await press()

    expect(receiveCopyAction).toHaveBeenCalledExactlyOnceWith({ copyId: 21 })
    expect(show).toHaveBeenCalledExactlyOnceWith({
      kind: 'success',
      message: 'Saved to Tampere',
      undo: { token: 'tok', seconds: 8 },
    })
    expect(router.refresh).toHaveBeenCalledOnce()
  })

  it('toasts "Saved" when the copy landed with no location', async () => {
    receiveCopyAction.mockResolvedValue({
      ok: true,
      data: { savedTo: null, undoToken: 'tok', undoSeconds: 8 },
    })

    await press()

    expect(show).toHaveBeenCalledExactlyOnceWith({
      kind: 'success',
      message: 'Saved',
      undo: { token: 'tok', seconds: 8 },
    })
  })

  it('refreshes on NOT_FOUND with no toast, so no dead Link is left', async () => {
    receiveCopyAction.mockResolvedValue({ ok: false, code: 'NOT_FOUND' })

    await press()

    expect(show).not.toHaveBeenCalled()
    expect(router.refresh).toHaveBeenCalledOnce()
  })

  it('reports any other failure and leaves the Answer as it was', async () => {
    receiveCopyAction.mockResolvedValue({ ok: false, code: 'INTERNAL' })

    await press()

    expect(show).toHaveBeenCalledExactlyOnceWith({ kind: 'error', code: 'INTERNAL' })
    expect(router.refresh).not.toHaveBeenCalled()
  })
})
