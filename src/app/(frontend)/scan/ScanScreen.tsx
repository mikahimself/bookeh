'use client'

import type { IScannerControls } from '@zxing/browser'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useTransition, type FormEvent } from 'react'

import { ProgressLine } from '../components/ProgressLine'
import { TextField } from '../components/TextField'

import { isbnFromBarcode } from './barcode'
import { useCamera } from './CameraSession'

/** Between decode attempts, and after a successful one, in milliseconds. */
const SCAN_ATTEMPT_MS = 100
const SCAN_SUCCESS_MS = 500

/**
 * The Scan screen (EXPERIENCE.md, Scan): the camera frame reading ISBN
 * barcodes, and the ISBN field under it. A read goes straight to
 * `/scan?isbn=` with no tap; the field submits on Go. Both navigate in a
 * transition, with the progress line while the server looks the ISBN up, and
 * replace when the address already carries an `isbn` (a corrected entry). The
 * text goes as typed: the browser never normalises it. Without JS the field
 * still submits as a GET form. Reading is ignored while an `isbn` is in the
 * address, and after a read or submit until the address changes.
 *
 * `isbn` is the text in the address, kept in the field; `error` the message
 * under it. Until the camera is on (permission pending, refused, or none)
 * the frame gives way to the no-camera message; once the camera is refused
 * or lost, the field takes focus. zxing is imported lazily, so it is only
 * loaded here.
 */
export function ScanScreen({ isbn, error }: { isbn?: string; error?: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { state, stream, start } = useCamera()
  const video = useRef<HTMLVideoElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const handled = useRef(isbn !== undefined)
  const [pending, startTransition] = useTransition()

  const go = (text: string) => {
    handled.current = true
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
    handled.current = isbn !== undefined
  }, [isbn])

  useEffect(() => {
    if (state === 'off') field.current?.focus()
  }, [state])

  useEffect(() => {
    const element = video.current
    if (state !== 'on' || !stream || !element) return

    let cancelled = false
    let controls: IScannerControls | undefined
    element.srcObject = stream

    const run = async () => {
      // A rejected play (an interrupted load) is no reason to stop: the
      // loop only finds nothing until the video runs.
      await element.play().catch(() => undefined)
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ])
      if (cancelled) return

      const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]])
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: SCAN_ATTEMPT_MS,
        delayBetweenScanSuccess: SCAN_SUCCESS_MS,
      })
      // `scan()` only loops over the element; its stop leaves the stream alone.
      controls = reader.scan(element, (result) => {
        if (!result || handled.current) return
        const read = isbnFromBarcode(BarcodeFormat[result.getBarcodeFormat()], result.getText())
        if (read) onRead(read)
      })
    }
    void run()

    return () => {
      cancelled = true
      controls?.stop()
      element.srcObject = null
    }
  }, [state, stream])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // One lookup at a time: a second Go waits for the first.
    if (pending) return
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
        <div className="flex flex-col gap-2">
          <div className="relative aspect-[4/3] border-2 border-text">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              aria-label={t('scan.cameraHint')}
              className="size-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-x-[14%] top-1/2 h-stroke-control -translate-y-1/2 bg-accent"
            />
          </div>
          <p className="text-meta text-text-muted">{t('scan.cameraHint')}</p>
        </div>
      )}
      <form action="/scan" onSubmit={submit} className="flex flex-col gap-2">
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
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </form>
    </>
  )
}
