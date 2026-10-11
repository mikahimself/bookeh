'use client'

import type { IScannerControls } from '@zxing/browser'
import { useTranslations } from 'next-intl'
import Form from 'next/form'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { TextField } from '../components/TextField'

import { isbnFromBarcode } from './barcode'
import { useCamera } from './CameraSession'

/** Between decode attempts, and after a successful one, in milliseconds. */
const SCAN_ATTEMPT_MS = 100
const SCAN_SUCCESS_MS = 500

/**
 * The Scan screen (EXPERIENCE.md, Scan): the camera frame reading ISBN
 * barcodes, and the ISBN field under it. A read goes straight to
 * `/scan?isbn=` with no tap; the field submits on Go as a GET form, so the
 * browser never normalises what is typed. Reading is ignored while an
 * `isbn` is in the address, and after a read until the address changes.
 * Until the camera is on (permission pending, refused, or none) the frame
 * gives way to the no-camera message; once the camera is refused or lost,
 * the field takes focus. zxing is imported lazily, so it is only loaded here.
 */
export function ScanScreen({ submitted }: { submitted?: string }) {
  const t = useTranslations('scan')
  const router = useRouter()
  const { state, stream, start } = useCamera()
  const video = useRef<HTMLVideoElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const handled = useRef(submitted !== undefined)

  useEffect(() => start(), [start])

  useEffect(() => {
    handled.current = submitted !== undefined
  }, [submitted])

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
        const isbn = isbnFromBarcode(BarcodeFormat[result.getBarcodeFormat()], result.getText())
        if (!isbn) return
        handled.current = true
        router.push(`/scan?isbn=${isbn}`)
      })
    }
    void run()

    return () => {
      cancelled = true
      controls?.stop()
      element.srcObject = null
    }
  }, [state, stream, router])

  return (
    <>
      {state !== 'on' ? (
        <p className="text-control text-text">{t('noCamera')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative aspect-[4/3] border-2 border-text">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              aria-label={t('cameraHint')}
              className="size-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-x-[14%] top-1/2 h-stroke-control -translate-y-1/2 bg-accent"
            />
          </div>
          <p className="text-meta text-text-muted">{t('cameraHint')}</p>
        </div>
      )}
      <Form
        action="/scan"
        replace={submitted !== undefined}
        prefetch={false}
        className="flex flex-col gap-2"
      >
        <TextField
          ref={field}
          name="isbn"
          label={t('isbn')}
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />
        {submitted !== undefined && <p className="text-meta text-text-muted">{submitted}</p>}
      </Form>
    </>
  )
}
