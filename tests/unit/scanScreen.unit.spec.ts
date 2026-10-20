// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
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
  createElement(CameraSession, null, createElement(ScanScreen, props))

const renderScan = (props?: Props) => render(tree(props))

/** The decode callback once the loop is running. */
const decoder = async (): Promise<Callback> => {
  await waitFor(() => expect(scan).toHaveBeenCalled())
  return scan.mock.calls[0][1]
}

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

  it('pushes the Answer address on an ISBN barcode, once, and ignores other codes', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    renderScan()
    const decode = await decoder()

    act(() => decode(undefined))
    act(() => decode(result(EAN_8, '97812345')))
    act(() => decode(result(EAN_13, '5901234123457')))
    expect(push).not.toHaveBeenCalled()

    act(() => decode(result(EAN_13, '9789510123456')))
    act(() => decode(result(EAN_13, '9789510123457')))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/scan?isbn=9789510123456')
    expect(replace).not.toHaveBeenCalled()
  })

  it('ignores reads while an isbn is in the address and reads again when it leaves', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    const view = renderScan({ isbn: '9789510123456' })
    const decode = await decoder()
    expect(input().value).toBe('9789510123456')

    act(() => decode(result(EAN_13, '9789510123457')))
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()

    view.rerender(tree())
    expect(input().value).toBe('')
    act(() => decode(result(EAN_13, '9789510123457')))
    expect(push).toHaveBeenCalledWith('/scan?isbn=9789510123457')
  })

  it('pushes the typed text as is on Go, then ignores reads; an empty field goes nowhere', async () => {
    getUserMedia.mockResolvedValue(fakeStream().stream)
    renderScan()
    const decode = await decoder()

    submit('  ')
    expect(push).not.toHaveBeenCalled()

    submit('951-0 4123&x')
    expect(push).toHaveBeenCalledWith('/scan?isbn=951-0%204123%26x')
    act(() => decode(result(EAN_13, '9789510123457')))
    expect(push).toHaveBeenCalledTimes(1)
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
