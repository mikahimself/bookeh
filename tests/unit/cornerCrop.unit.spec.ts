// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Photo } from '@/app/(frontend)/components/cornerCrop/decodePhoto'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
// The overlays' close may replace the address (`useCloseOnBack`); nothing here moves it.
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/app/(frontend)/components/cornerCrop/decodePhoto', () => ({ decodePhoto: vi.fn() }))

const { installNavigationTracking } = await import('@/app/(frontend)/components/navigation')
const { CornerCrop } = await import('@/app/(frontend)/components/cornerCrop/CornerCrop')
const { decodePhoto: mockedDecode } =
  await import('@/app/(frontend)/components/cornerCrop/decodePhoto')
const { decodePhoto } = await vi.importActual<
  typeof import('@/app/(frontend)/components/cornerCrop/decodePhoto')
>('@/app/(frontend)/components/cornerCrop/decodePhoto')

installNavigationTracking()

// jsdom has neither; the stage measures 0, so the photo shows at scale 1.
Object.assign(URL, { createObjectURL: () => 'blob:photo', revokeObjectURL: () => undefined })

const photo: Photo = {
  image: new Blob(['jpeg'], { type: 'image/jpeg' }),
  width: 1000,
  height: 1500,
}

function renderCrop(decoded: Photo | null) {
  vi.mocked(mockedDecode).mockResolvedValue(decoded)
  const handlers = { onUse: vi.fn(), onCancel: vi.fn(), onReject: vi.fn() }
  render(createElement(CornerCrop, { file: new Blob(['file']), ...handlers }))
  return handlers
}

const step = () => screen.findByRole('dialog', { name: 'label' })
const use = () => screen.getByRole('button', { name: 'use' }) as HTMLButtonElement

describe('CornerCrop', () => {
  beforeEach(() => {
    window.history.pushState({ page: 'list' }, '', '/')
    document.documentElement.dataset.theme = 'light'
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects a file it cannot decode without opening', async () => {
    const { onReject } = renderCrop(null)
    await waitFor(() => expect(onReject).toHaveBeenCalledExactlyOnceWith('NOT_AN_IMAGE'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens dark in the light theme and returns the start rectangle on Use', async () => {
    const { onUse, onCancel } = renderCrop(photo)
    expect((await step()).getAttribute('data-palette')).toBe('dark')
    expect(screen.getByText('hint')).toBeTruthy()
    for (const name of ['tl', 'tr', 'br', 'bl', 'cancel']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }

    fireEvent.click(use())
    await waitFor(() =>
      expect(onUse).toHaveBeenCalledExactlyOnceWith({
        image: photo.image,
        corners: [
          { x: 200, y: 300 },
          { x: 800, y: 300 },
          { x: 800, y: 1200 },
          { x: 200, y: 1200 },
        ],
      }),
    )
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('disables Use once the arrows move the top left corner past the top right', async () => {
    renderCrop(photo)
    await step()
    expect(use().disabled).toBe(false)
    const tl = screen.getByRole('button', { name: 'tl' })
    // 600 px apart at scale 1: 61 Shift steps of 10 cross over.
    for (let i = 0; i < 61; i++) fireEvent.keyDown(tl, { key: 'ArrowRight', shiftKey: true })
    expect(use().disabled).toBe(true)
  })

  it('returns corners in JPEG pixels from a stage at another scale', async () => {
    // 540×790 fits the 1000×1500 photo at 0.5, 20px in from the top left.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private done: ResizeObserverCallback) {}
        observe() {
          this.done(
            [{ contentRect: { width: 540, height: 790 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          )
        }
        disconnect() {}
      },
    )
    Object.assign(HTMLElement.prototype, { setPointerCapture: () => undefined })
    const { onUse } = renderCrop(photo)
    await step()
    const tl = screen.getByRole('button', { name: 'tl' })
    // TL (200, 300) shows at (120, 170); grabbed 5, 2 px off it.
    fireEvent.pointerDown(tl, { pointerId: 1, clientX: 125, clientY: 172 })
    // 50 px left in x; far above the photo in y, so it clamps to 0.
    fireEvent.pointerMove(tl, { pointerId: 1, clientX: 75, clientY: -100 })
    fireEvent.pointerUp(tl, { pointerId: 1 })
    // One screen px is 2 JPEG px.
    fireEvent.keyDown(tl, { key: 'ArrowRight' })

    fireEvent.click(use())
    await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1))
    expect(onUse.mock.calls[0][0].corners[0]).toEqual({ x: 102, y: 0 })
  })

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'cancel' }))],
    ['Esc', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    ['Back', () => act(() => window.history.back())],
  ])('returns nothing on %s', async (_, close) => {
    const { onUse, onCancel } = renderCrop(photo)
    await step()
    close()
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onUse).not.toHaveBeenCalled()
  })
})

describe('decodePhoto', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('is null when the browser cannot decode the file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('bad')))
    expect(await decodePhoto(new Blob(['text'], { type: 'text/plain' }))).toBeNull()
  })

  it.each([
    [4000, 3000, 2000, 1500],
    [800, 600, 800, 600],
  ])('decodes %i×%i as a %i×%i JPEG', async (width, height, outWidth, outHeight) => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: () => undefined,
      drawImage: () => undefined,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      done,
      type,
    ) {
      expect([this.width, this.height]).toEqual([outWidth, outHeight])
      done(new Blob(['jpeg'], { type }))
    })

    const decoded = await decodePhoto(new Blob(['photo']))
    expect(decoded).toMatchObject({ width: outWidth, height: outHeight })
    expect(decoded?.image.type).toBe('image/jpeg')
    expect(close).toHaveBeenCalled()
  })
})
