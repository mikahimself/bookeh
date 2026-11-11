'use client'

import type { IScannerControls } from '@zxing/browser'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, useTransition, type FormEvent } from 'react'

import { AppBar, AppBarButton, AppBarLink } from '../components/AppBar'
import { buttonClass } from '../components/Button'
import { TextLink } from '../components/Link'
import { ProgressLine } from '../components/ProgressLine'
import { TextField } from '../components/TextField'

import { isbnFromBarcode } from './barcode'
import { useCamera } from './CameraSession'
import { loadZxing } from './zxing'

/** Between decode attempts, and after a successful one, in milliseconds. */
const SCAN_ATTEMPT_MS = 100
const SCAN_SUCCESS_MS = 500

/**
 * The Scan screen (EXPERIENCE.md, Scan): the camera frame reading ISBN
 * barcodes, and the ISBN field under it. A read goes straight to
 * `/scan?isbn=` with no tap; the field submits on Go or "find". Both navigate in a
 * transition, with the progress line while the server looks the ISBN up, and
 * replace when the address already carries an `isbn` (a corrected entry). The
 * text goes as typed: the browser never normalises it. Without JS the field
 * still submits as a GET form. Reading pauses from a read or submit until
 * its lookup has landed; an Answer unmounts this screen, which stops the
 * loop. The ISBN last read is held by the session's gate (`readGate.ts`) and
 * ignored until it has left the camera's view, so the book still in front of
 * the camera after Back or a save does not reopen its Answer. A typed entry
 * holds nothing. Add without ISBN under the field opens the Not found Answer
 * with no ISBN (`/scan?title=`), a push like a read, and Find by title or
 * author opens Lookup (`/scan/find`) beside it.
 *
 * `isbn` is the text in the address, kept in the field; `error` the message
 * under it. Until the camera is on (permission pending, refused, or none)
 * the frame gives way to the no-camera message; once the camera is refused
 * or lost, the field takes focus. zxing is imported lazily (`zxing.ts`), so
 * it is only loaded here.
 */
export function ScanScreen({ isbn, error }: { isbn?: string; error?: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { state, stream, start, gate } = useCamera()
  const video = useRef<HTMLVideoElement>(null)
  const field = useRef<HTMLInputElement>(null)
  // Set at once in `go()`: `pending` only commits a render later.
  const paused = useRef(false)
  const [pending, startTransition] = useTransition()
  // Set while the camera's video track reports torch support.
  const [torch, setTorch] = useState<{ set: (on: boolean) => Promise<void> } | null>(null)
  const [lit, setLit] = useState(false)
  const litNow = useRef(false)
  const torchSet = useRef<((on: boolean) => Promise<void>) | null>(null)

  const go = (text: string) => {
    paused.current = true
    const href = `/scan?isbn=${encodeURIComponent(text)}`
    startTransition(() => {
      if (isbn !== undefined) router.replace(href)
      else router.push(href)
    })
  }
  // The decode loop outlives renders; it reads the current address through this.
  const onRead = useEffectEvent(go)

  useEffect(() => start(), [start])

  useEffect(() => {
    if (!pending) paused.current = false
  }, [pending])

  useEffect(() => {
    if (state === 'off') field.current?.focus()
  }, [state])

  useEffect(() => {
    const element = video.current
    if (state !== 'on' || !stream || !element) return

    let cancelled = false
    let controls: IScannerControls | undefined
    element.srcObject = stream

    // A locked phone or hidden tab is no decoding either.
    const onVisible = () => {
      if (document.visibilityState === 'visible') gate.resume(performance.now())
    }
    document.addEventListener('visibilitychange', onVisible)

    const run = async () => {
      // A rejected play (an interrupted load) is no reason to stop: the
      // loop only finds nothing until the video runs.
      await element.play().catch(() => undefined)
      const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = await loadZxing()
      if (cancelled) return

      const track = stream
        .getVideoTracks()
        .find((candidate) =>
          BrowserMultiFormatReader.mediaStreamIsTorchCompatibleTrack(candidate),
        )
      if (track) {
        const set = (on: boolean) => BrowserMultiFormatReader.mediaStreamSetTorch(track, on)
        torchSet.current = set
        setTorch({ set })
      }

      const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]])
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: SCAN_ATTEMPT_MS,
        delayBetweenScanSuccess: SCAN_SUCCESS_MS,
      })
      // Time spent away from Scan (an Answer) is not time out of view.
      gate.resume(performance.now())
      // `scan()` only loops over the element; its stop leaves the stream alone.
      // It calls back on every attempt, with no result when nothing was
      // decoded; those still reach the gate, so a hold that has timed out is
      // released before the next read.
      controls = reader.scan(element, (result) => {
        const read = result
          ? isbnFromBarcode(BarcodeFormat[result.getBarcodeFormat()], result.getText())
          : null
        const now = performance.now()
        const fresh = gate.see(read, now)
        if (!fresh || paused.current) return
        gate.hold(fresh, now)
        onRead(fresh)
      })
    }
    void run()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      controls?.stop()
      element.srcObject = null
      // The light goes off with the screen; a rejected switch-off is ignored.
      if (litNow.current) {
        litNow.current = false
        void torchSet.current?.(false).catch(() => undefined)
      }
      torchSet.current = null
      setTorch(null)
      setLit(false)
    }
  }, [state, stream, gate])

  const toggleTorch = async () => {
    if (!torch) return
    const next = !lit
    try {
      await torch.set(next)
    } catch {
      return
    }
    litNow.current = next
    setLit(next)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // One lookup at a time: a second Go waits for the first, a read's included.
    if (paused.current) return
    const text = field.current?.value ?? ''
    // Go on an empty field is no submission.
    if (text.trim()) go(text)
  }

  return (
    <>
      {pending && <ProgressLine label={t('progress.loading')} />}
      {state !== 'on' ? (
        <p className="text-control text-text">{t('scan.noCamera')}</p>
      ) : (
        <div className="relative aspect-[4/3] bg-text">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            aria-label={t('scan.cameraHint')}
            className="size-full object-cover"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute top-6 left-6 size-[40px] border-t-4 border-l-4 border-bar-ink" />
            <div className="absolute top-6 right-6 size-[40px] border-t-4 border-r-4 border-bar-ink" />
            <div className="absolute bottom-6 left-6 size-[40px] border-b-4 border-l-4 border-bar-ink" />
            <div className="absolute right-6 bottom-6 size-[40px] border-r-4 border-b-4 border-bar-ink" />
            <div className="absolute inset-x-[14%] top-1/2 h-stroke-control -translate-y-1/2 bg-accent" />
            <p className="absolute inset-x-0 bottom-4 text-center text-meta text-bar-ink">
              {t('scan.frameHint')}
            </p>
          </div>
        </div>
      )}
      <form action="/scan" onSubmit={submit}>
        <TextField
          // A new address resets the field to its text.
          key={isbn ?? ''}
          ref={field}
          name="isbn"
          label={t('scan.isbn')}
          defaultValue={isbn}
          error={error}
          // The field is a new element after Go; keep the keyboard up to correct it.
          autoFocus={error !== undefined}
          enterKeyHint="go"
          // Digits pad on phones; an ISBN-10 ending in X is typed as its 978 ISBN-13.
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          // The number pad has no Return, so "find" submits like the Go key.
          action={
            <button type="submit" className={buttonClass('secondary', { compact: true })}>
              {t('scan.find')}
            </button>
          }
        />
      </form>
      {/* A block around each Link, so it is only as wide as its text. */}
      <div className="hidden flex-col items-start gap-2 wide:flex">
        <TextLink href="/scan?title=">{t('scan.addWithoutIsbn')}</TextLink>
        <TextLink href="/scan/find">{t('lookup.open')}</TextLink>
      </div>
      <AppBar standalone className="-mx-page-margin-phone mt-auto">
        {torch && (
          <AppBarButton icon="torch" aria-pressed={lit} onClick={() => void toggleTorch()}>
            {t('scan.torch')}
          </AppBarButton>
        )}
        <AppBarLink icon="noIsbn" href="/scan?title=">
          {t('scan.addWithoutIsbn')}
        </AppBarLink>
        <AppBarLink icon="find" href="/scan/find">
          {t('scan.findBar')}
        </AppBarLink>
      </AppBar>
    </>
  )
}
