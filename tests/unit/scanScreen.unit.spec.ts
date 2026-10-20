// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, use, useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
const replace = vi.fn()
const scan = vi.fn()
const stop = vi.fn()
const getUserMedia = vi.fn()

/** What zxing hands the callback: a format number and the decoded text. */
type Result = { getBarcodeFormat: () => number; getText: () => string }
type Callback = (result: Result | undefined) => void

const EAN_13 = 7
const EAN_8 = 6

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13, [EAN_13]: 'EAN_13', EAN_8, [EAN_8]: 'EAN_8' },
  DecodeHintType: { POSSIBLE_FORMATS: 2 },
}))
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    scan(element: HTMLVideoElement, callback: Callback) {
      scan(element, callback)
      return { stop }
    }
  },
}))

const { CameraSession } = await import('@/app/(frontend)/scan/CameraSession')
const { ScanScreen } = await import('@/app/(frontend)/scan/ScanScreen')
const { LEFT_VIEW_MS } = await import('@/app/(frontend)/scan/readGate')

/** `performance.now()`, the gate's clock. */
let clock = 0

let startLookup: ((lookup: Promise<void>) => void) | undefined

/**
 * Stands in for the server lookup: a lookup started inside the navigation's
 * transition suspends it, so the transition stays pending until it settles.
 */
function Lookup() {
  const [lookup, setLookup] = useState<Promise<void> | null>(null)
  useEffect(() => {
    startLookup = setLookup
  }, [])
  if (lookup) use(lookup)
  return null
}

/**
 * The next push or replace stays pending until the returned settle runs.
 * Start it inside an async `act`, or React never retries the suspended render.
 */
const holdLookup = () => {
  let settle!: () => void
  const lookup = new Promise<void>((resolve) => (settle = resolve))
  const start = () => startLookup?.(lookup)
  push.mockImplementationOnce(start)
  replace.mockImplementationOnce(start)
  return () => act(async () => settle())
}

class FakeTrack extends EventTarget {
  stop = vi.fn()
}

const fakeStream = () => {
  const track = new FakeTrack()
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  return { track, stream: stream as unknown as MediaStream }
}

const result = (format: number, text: string): Result => ({
  getBarcodeFormat: () => format,
  getText: () => text,
})

type Props = { isbn?: string; error?: string }

const tree = (props: Props = {}) =>
  createElement(CameraSession, null, createElement(ScanScreen, props), createElement(Lookup))

/** The same session showing an Answer: no Scan screen. */
const answer = () => createElement(CameraSession, null, createElement(Lookup))

const renderScan = (props?: Props) => render(tree(props))

/** The decode callback once the `loop`th loop (from 1) is running. */
const decoder = async (loop = 1): Promise<Callback> => {
  await waitFor(() => expect(scan).toHaveBeenCalledTimes(loop))
  return scan.mock.calls[loop - 1][1]
}

const X = '9789510123456'
const Y = '9789510123457'

const input = () => screen.getByLabelText<HTMLInputElement>('scan.isbn')

/** Types `text` into the field and presses Go. */
const submit = (text: string) => {
  fireEvent.change(input(), { target: { value: text } })
  fireEvent.submit(input().closest('form')!)
}

describe('ScanScreen', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
  })
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('asks for the environment camera, and shows the no-camera state until it answers', async () => {
    let grant!: (stream: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => (grant = resolve)))
    renderScan()
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    expect(screen.getByText('scan.noCamera')).toBeTruthy()
    expect(document.activeElement).not.toBe(screen.getByLabelText('scan.isbn'))

    await act(async () => grant(fakeStream().stream))
    expect(screen.queryByText('scan.noCamera')).toBeNull()
    expect(screen.getByLabelText('scan.cameraHint')).toBeInstanceOf(HTMLVideoElement)
  })

  it('pushes the Answer address on an ISBN barcode, ignores other codes, and holds the one read', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    renderScan()
    const decode = await decoder()

    act(() => decode(undefined))
    act(() => decode(result(EAN_8, '97812345')))
    act(() => decode(result(EAN_13, '5901234123457')))
    expect(push).not.toHaveBeenCalled()

    act(() => decode(result(EAN_13, X)))
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(`/scan?isbn=${X}`)
    expect(replace).not.toHaveBeenCalled()
  })

  it('ignores reads while the lookup is pending, and reads again once it lands', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    renderScan()
    const decode = await decoder()
    const settle = holdLookup()

    await act(async () => decode(result(EAN_13, X)))
    expect(screen.getByRole('progressbar')).toBeTruthy()
    act(() => decode(result(EAN_13, Y)))
    expect(push).toHaveBeenCalledTimes(1)

    await settle()
    expect(screen.queryByRole('progressbar')).toBeNull()
    act(() => decode(result(EAN_13, Y)))
    expect(push).toHaveBeenLastCalledWith(`/scan?isbn=${Y}`)
  })

  it('back from an Answer with the book in view, reads it again only once it has left view', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    const view = renderScan()
    const first = await decoder()
    act(() => first(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(1)

    // A long look at the Answer: no decoding, so none of it counts.
    view.rerender(answer())
    clock += 10_000
    view.rerender(tree())
    const decode = await decoder(2)

    act(() => decode(result(EAN_13, X)))
    clock += LEFT_VIEW_MS - 1
    act(() => decode(undefined))
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(1)

    clock += LEFT_VIEW_MS
    act(() => decode(undefined))
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenLastCalledWith(`/scan?isbn=${X}`)
  })

  it('releases a timed-out hold on an empty decode', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    const view = renderScan()
    const first = await decoder()
    act(() => first(result(EAN_13, X)))
    clock += LEFT_VIEW_MS
    act(() => first(undefined))

    view.rerender(answer())
    view.rerender(tree())
    const decode = await decoder(2)
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('does not count time with the page hidden as out of view', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    renderScan()
    const decode = await decoder()
    act(() => decode(result(EAN_13, X)))

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    clock += 10_000
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
  })

  it('back from an Answer, another book opens at once', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    const view = renderScan()
    const first = await decoder()
    act(() => first(result(EAN_13, X)))

    view.rerender(answer())
    view.rerender(tree())
    const decode = await decoder(2)
    act(() => decode(result(EAN_13, X)))
    act(() => decode(result(EAN_13, Y)))
    expect(push).toHaveBeenCalledTimes(2)
    expect(push).toHaveBeenLastCalledWith(`/scan?isbn=${Y}`)
  })

  it('forgets the held book when the task closes', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    const view = renderScan()
    const first = await decoder()
    act(() => first(result(EAN_13, X)))
    view.unmount()

    renderScan()
    const decode = await decoder(2)
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('reads with an isbn in the address and replaces, still ignoring the held one', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    const view = renderScan()
    const decode = await decoder()
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledWith(`/scan?isbn=${X}`)

    // The lookup lands back on Scan (the rate limit), X still in view.
    view.rerender(tree({ isbn: X }))
    expect(input().value).toBe(X)
    act(() => decode(result(EAN_13, X)))
    expect(replace).not.toHaveBeenCalled()

    act(() => decode(result(EAN_13, Y)))
    expect(replace).toHaveBeenCalledWith(`/scan?isbn=${Y}`)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('pushes the typed text as is on Go, ignoring reads until it lands; an empty field goes nowhere', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    renderScan()
    const decode = await decoder()

    submit('  ')
    expect(push).not.toHaveBeenCalled()

    const settle = holdLookup()
    await act(async () => submit('951-0 4123&x'))
    expect(push).toHaveBeenCalledWith('/scan?isbn=951-0%204123%26x')
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenCalledTimes(1)

    await settle()
    act(() => decode(result(EAN_13, X)))
    expect(push).toHaveBeenLastCalledWith(`/scan?isbn=${X}`)
    expect(replace).not.toHaveBeenCalled()
  })

  it('replaces a corrected entry and shows the error under the field', () => {
    getUserMedia.mockReturnValue(new Promise<MediaStream>(() => undefined))
    renderScan({ isbn: '978-951-0-4123', error: 'Not an ISBN.' })
    expect(input().value).toBe('978-951-0-4123')
    expect(input().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Not an ISBN.').id).toBe(input().getAttribute('aria-describedby'))

    submit('9789510412345')
    expect(replace).toHaveBeenCalledWith('/scan?isbn=9789510412345')
    expect(push).not.toHaveBeenCalled()
  })

  it('shows the no-camera message and focuses the field when the camera is refused', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    renderScan()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('scan.isbn')))
    expect(screen.getByText('scan.noCamera')).toBeTruthy()
    expect(scan).not.toHaveBeenCalled()
  })

  it('does the same when the track ends mid-session', async () => {
    const { track, stream } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    renderScan()
    await decoder()
    expect(screen.queryByText('scan.noCamera')).toBeNull()

    act(() => {
      track.dispatchEvent(new Event('ended'))
    })
    await screen.findByText('scan.noCamera')
    expect(document.activeElement).toBe(screen.getByLabelText('scan.isbn'))
    expect(stop).toHaveBeenCalled()
  })

  it('stops the stream when the task closes', async () => {
    const { track, stream } = fakeStream()
    getUserMedia.mockResolvedValue(stream)
    const view = renderScan()
    await decoder()
    view.unmount()
    expect(track.stop).toHaveBeenCalled()
  })

  it('stops a stream that arrives after the task closed and never scans it', async () => {
    let grant!: (stream: MediaStream) => void
    getUserMedia.mockReturnValue(new Promise<MediaStream>((resolve) => (grant = resolve)))
    const view = renderScan()
    view.unmount()
    const { track, stream } = fakeStream()
    await act(async () => grant(stream))
    expect(track.stop).toHaveBeenCalled()
    expect(scan).not.toHaveBeenCalled()
  })
})
