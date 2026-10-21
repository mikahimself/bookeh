'use client'

import { useTranslations } from 'next-intl'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { checkCorners, type Corners, type Point } from '@/lib/catalogue/corners'

import { Button } from '../Button'
import { FullScreenDialog } from '../ui/FullScreenDialog'
import { decodePhoto, type Photo } from './decodePhoto'

export type CornerCropResult = { image: Blob; corners: Corners }

export type CornerCropProps = {
  /** A new file opens the step once it decodes; the caller clears it on any outcome. */
  file: Blob | null
  /** The decoded JPEG and its corners in that JPEG's pixels, clockwise from top left. */
  onUse: (result: CornerCropResult) => void
  /** Cancel, Esc or Back: nothing is returned. */
  onCancel: () => void
  /** The browser couldn't decode `file`; the step never opened. */
  onReject: (code: 'NOT_AN_IMAGE') => void
}

/** The stage's gap round the photo, on each side: `page-margin-phone`. */
const PAD = 20
/** A handle's tap area: `spacing-tap`. */
const TAP = 44
const HANDLES = ['tl', 'tr', 'br', 'bl'] as const
const ARROWS: Partial<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

type Size = { width: number; height: number }
type Step = Photo & { url: string }

/** A centred 2:3 rectangle, `min(0.6·H, 0.9·W)` high. */
function startCorners({ width, height }: Size): Corners {
  const h = Math.min(0.6 * height, 0.9 * width)
  const w = (h * 2) / 3
  const left = (width - w) / 2
  const top = (height - h) / 2
  return [
    { x: left, y: top },
    { x: left + w, y: top },
    { x: left + w, y: top + h },
    { x: left, y: top + h },
  ]
}

/** `corners` with corner `i` moved to `p`, clamped to the image. */
function withCorner(corners: Corners, i: number, p: Point, size: Size): Corners {
  const next: [Point, Point, Point, Point] = [...corners]
  next[i] = {
    x: Math.min(size.width, Math.max(0, p.x)),
    y: Math.min(size.height, Math.max(0, p.y)),
  }
  return next
}

/**
 * DESIGN.md, Corner crop; EXPERIENCE.md, Corner crop: a full-screen step,
 * dark whatever the theme. The decoded photo fits the stage with the
 * outside of the four corners dimmed; each handle is dragged by pointer or
 * moved by the arrow keys (1 screen px, 10 with Shift). Use is disabled
 * unless `checkCorners()`, the server's own rule, holds.
 */
export function CornerCrop({ file, onUse, onCancel, onReject }: CornerCropProps) {
  const t = useTranslations('cornerCrop')
  const [step, setStep] = useState<Step | null>(null)
  const [open, setOpen] = useState(false)
  /** What the close returns: the result on Use, null on any other close. */
  const result = useRef<CornerCropResult | null>(null)
  const reject = useEffectEvent(onReject)

  useEffect(() => {
    if (!file) return
    let live = true
    let url: string | null = null
    void decodePhoto(file).then((photo) => {
      if (!live) return
      if (!photo) {
        reject('NOT_AN_IMAGE')
        return
      }
      url = URL.createObjectURL(photo.image)
      result.current = null
      setStep({ ...photo, url })
      setOpen(true)
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  const close = (outcome: CornerCropResult | null) => {
    result.current = outcome
    setOpen(false)
  }

  const closed = () => {
    if (step) URL.revokeObjectURL(step.url)
    const outcome = result.current
    result.current = null
    if (outcome) onUse(outcome)
    else onCancel()
  }

  return (
    <FullScreenDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(null)
      }}
      label={t('label')}
      onClosed={closed}
    >
      {/* Keyed by the photo, so each one starts from its own rectangle. */}
      {step && <CropStage key={step.url} step={step} onClose={close} />}
    </FullScreenDialog>
  )
}

/** The hint, the photo with its corners, and the foot. */
function CropStage({
  step,
  onClose,
}: {
  step: Step
  onClose: (outcome: CornerCropResult | null) => void
}) {
  const t = useTranslations('cornerCrop')
  const [corners, setCorners] = useState(() => startCorners(step))
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 })
  const stage = useRef<HTMLDivElement | null>(null)
  const grab = useRef<{ index: number; offset: Point } | null>(null)

  const measure = useCallback((node: HTMLDivElement | null) => {
    stage.current = node
    if (!node) return
    // At once, so the first paint already fits the photo.
    const { width, height } = node.getBoundingClientRect()
    setStageSize({ width, height })
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const scale =
    stageSize.width > 0 && stageSize.height > 0
      ? Math.min(
          (stageSize.width - 2 * PAD) / step.width,
          (stageSize.height - 2 * PAD) / step.height,
        )
      : 1
  const left = (stageSize.width - step.width * scale) / 2
  const top = (stageSize.height - step.height * scale) / 2
  const right = left + step.width * scale
  const bottom = top + step.height * scale
  const onScreen = corners.map((p) => ({ x: left + p.x * scale, y: top + p.y * scale }))
  const points = onScreen.map((p) => `${p.x},${p.y}`).join(' ')
  const inner = onScreen.map((p) => `${p.x} ${p.y}`).join(' L')

  /** The pointer's place in the photo's pixels. */
  const atPointer = (event: PointerEvent): Point => {
    const box = stage.current?.getBoundingClientRect()
    return {
      x: (event.clientX - (box?.left ?? 0) - left) / scale,
      y: (event.clientY - (box?.top ?? 0) - top) / scale,
    }
  }
  /** Drags keep the pointer's offset from the corner, so a grab off-centre doesn't jump. */
  const onPointerDown = (i: number, event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
    const p = atPointer(event)
    grab.current = { index: i, offset: { x: corners[i].x - p.x, y: corners[i].y - p.y } }
  }
  const onPointerMove = (i: number, event: PointerEvent<HTMLButtonElement>) => {
    const held = grab.current
    if (held?.index !== i) return
    const p = atPointer(event)
    setCorners((c) => withCorner(c, i, { x: p.x + held.offset.x, y: p.y + held.offset.y }, step))
  }
  const release = () => {
    grab.current = null
  }
  const onKeyDown = (i: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const d = ARROWS[event.key]
    if (!d) return
    event.preventDefault()
    const distance = (event.shiftKey ? 10 : 1) / scale
    setCorners((c) =>
      withCorner(c, i, { x: c[i].x + d.x * distance, y: c[i].y + d.y * distance }, step),
    )
  }

  return (
    <>
      <p className="px-page-margin-phone pt-[calc(var(--spacing-5)+env(safe-area-inset-top))] pb-2 text-meta text-text-muted wide:px-page-margin">
        {t('hint')}
      </p>
      <div ref={measure} className="relative min-h-0 flex-1 touch-none overflow-hidden select-none">
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
          <image
            href={step.url}
            x={left}
            y={top}
            width={step.width * scale}
            height={step.height * scale}
            preserveAspectRatio="none"
          />
          <path
            className="fill-crop-dim"
            fillRule="evenodd"
            d={`M${left} ${top}H${right}V${bottom}H${left}Z M${inner}Z`}
          />
          <polygon className="fill-none stroke-crop-halo stroke-4" points={points} />
          <polygon className="fill-none stroke-text stroke-2" points={points} />
        </svg>
        {HANDLES.map((name, i) => (
          <button
            key={name}
            type="button"
            aria-label={t(name)}
            className="group absolute size-tap touch-none bg-transparent outline-none"
            style={{ left: onScreen[i].x - TAP / 2, top: onScreen[i].y - TAP / 2 }}
            onPointerDown={(event) => onPointerDown(i, event)}
            onPointerMove={(event) => onPointerMove(i, event)}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={(event) => onKeyDown(i, event)}
          >
            {/* The 20px square over its 4px halo: 1px each side of the 2px outline. */}
            <span className="absolute inset-3 border-2 border-text shadow-[0_0_0_var(--spacing-stroke-hairline)_var(--color-crop-halo),inset_0_0_0_var(--spacing-stroke-hairline)_var(--color-crop-halo)] group-focus-visible:outline-2 group-focus-visible:outline-offset-3 group-focus-visible:outline-text group-focus-visible:outline-solid" />
          </button>
        ))}
      </div>
      <div className="flex gap-2 border-t-2 border-text px-page-margin-phone pt-3 pb-[calc(var(--spacing-4)+env(safe-area-inset-bottom))] max-wide:*:flex-1 wide:justify-end wide:px-page-margin">
        <Button variant="secondary" onClick={() => onClose(null)}>
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={!checkCorners(corners, step)}
          onClick={() => onClose({ image: step.image, corners })}
        >
          {t('use')}
        </Button>
      </div>
    </>
  )
}
