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

import {
  checkCorners,
  isStraight,
  snapToStraight,
  type Corners,
  type Point,
} from '@/lib/catalogue/corners'

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
/** Side `i` runs from corner `i` to corner `(i + 1) % 4`. */
const SIDES = ['top', 'right', 'bottom', 'left'] as const
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
 * `p` pulled toward straight from both neighbours at once: each pull is taken
 * from `p`, and when both move it the result is where the two pulled lines
 * cross, so neither side undoes the other. Nearly parallel lines fall back to
 * pulling one after the other.
 */
function snapBoth(prev: Point, next: Point, p: Point): Point {
  const a = snapToStraight(prev, p)
  const b = snapToStraight(next, p)
  const movedA = a.x !== p.x || a.y !== p.y
  const movedB = b.x !== p.x || b.y !== p.y
  if (!movedA || !movedB) return movedA ? a : movedB ? b : p
  const d1 = { x: a.x - prev.x, y: a.y - prev.y }
  const d2 = { x: b.x - next.x, y: b.y - next.y }
  const cross = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(cross) < 1e-6 * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) {
    return snapToStraight(next, a)
  }
  const t = ((next.x - prev.x) * d2.y - (next.y - prev.y) * d2.x) / cross
  return { x: prev.x + d1.x * t, y: prev.y + d1.y * t }
}

/** `corners` with side `i` moved by `d` (photo pixels), `d` clamped so both ends stay in the image. */
function withSide(corners: Corners, i: number, d: Point, size: Size): Corners {
  const a = corners[i]
  const b = corners[(i + 1) % 4]
  const dx = Math.min(size.width - Math.max(a.x, b.x), Math.max(-Math.min(a.x, b.x), d.x))
  const dy = Math.min(size.height - Math.max(a.y, b.y), Math.max(-Math.min(a.y, b.y), d.y))
  const next: [Point, Point, Point, Point] = [...corners]
  next[i] = { x: a.x + dx, y: a.y + dy }
  next[(i + 1) % 4] = { x: b.x + dx, y: b.y + dy }
  return next
}

/**
 * DESIGN.md, Corner crop; EXPERIENCE.md, Corner crop: a full-screen step,
 * dark whatever the theme. The decoded photo fits the stage with the
 * outside of the four corners dimmed; each handle is dragged by pointer or
 * moved by the arrow keys (1 screen px, 10 with Shift), and each side has a
 * diamond handle that moves both its ends. Sides within 1° of an axis are
 * drawn heavy in the accent; a dragged corner is pulled toward straight
 * (Alt skips it). Use is disabled
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
  const sideGrab = useRef<{ index: number; corners: Corners; pointer: Point } | null>(null)

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
  const sides = onScreen.map((p, i) => {
    const q = onScreen[(i + 1) % 4]
    return { a: p, b: q, straight: isStraight(p, q) }
  })
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
    const raw = { x: p.x + held.offset.x, y: p.y + held.offset.y }
    setCorners((c) => {
      // Clamp first so a pointer far outside the photo is judged from where the corner lands.
      let at = withCorner(c, i, raw, step)[i]
      if (!event.altKey) {
        at = snapBoth(c[(i + 3) % 4], c[(i + 1) % 4], at)
      }
      return withCorner(c, i, at, step)
    })
  }
  const release = () => {
    grab.current = null
    sideGrab.current = null
  }
  const onSideDown = (i: number, event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
    sideGrab.current = { index: i, corners, pointer: atPointer(event) }
  }
  const onSideMove = (i: number, event: PointerEvent<HTMLButtonElement>) => {
    const held = sideGrab.current
    if (held?.index !== i) return
    const p = atPointer(event)
    setCorners(
      withSide(held.corners, i, { x: p.x - held.pointer.x, y: p.y - held.pointer.y }, step),
    )
  }
  const onSideKeyDown = (i: number, event: KeyboardEvent<HTMLButtonElement>) => {
    const d = ARROWS[event.key]
    if (!d) return
    event.preventDefault()
    const distance = (event.shiftKey ? 10 : 1) / scale
    setCorners((c) => withSide(c, i, { x: d.x * distance, y: d.y * distance }, step))
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
          {sides.map(({ a, b, straight }, i) => (
            <line
              key={`halo-${SIDES[i]}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`stroke-crop-halo ${straight ? 'stroke-6' : 'stroke-4'}`}
            />
          ))}
          {sides.map(({ a, b, straight }, i) => (
            <line
              key={SIDES[i]}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={straight ? 'stroke-accent stroke-4' : 'stroke-text stroke-2'}
            />
          ))}
        </svg>
        {HANDLES.map((name, i) => (
          <button
            key={name}
            type="button"
            aria-label={t(name)}
            className="group absolute z-10 size-tap touch-none bg-transparent outline-none"
            style={{ left: onScreen[i].x - TAP / 2, top: onScreen[i].y - TAP / 2 }}
            onPointerDown={(event) => onPointerDown(i, event)}
            onPointerMove={(event) => onPointerMove(i, event)}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={(event) => onKeyDown(i, event)}
          >
            {/* The 24px square over its 4px halo: 1px each side of the 2px outline. */}
            <span className="absolute top-1/2 left-1/2 size-6 -translate-1/2 border-2 border-text shadow-[0_0_0_var(--spacing-stroke-hairline)_var(--color-crop-halo),inset_0_0_0_var(--spacing-stroke-hairline)_var(--color-crop-halo)] group-focus-visible:outline-2 group-focus-visible:outline-offset-3 group-focus-visible:outline-text group-focus-visible:outline-solid" />
          </button>
        ))}
        {SIDES.map((name, i) => {
          const a = onScreen[i]
          const b = onScreen[(i + 1) % 4]
          return (
            <button
              key={name}
              type="button"
              aria-label={t(name)}
              className="group absolute size-tap touch-none bg-transparent outline-none"
              style={{ left: (a.x + b.x) / 2 - TAP / 2, top: (a.y + b.y) / 2 - TAP / 2 }}
              onPointerDown={(event) => onSideDown(i, event)}
              onPointerMove={(event) => onSideMove(i, event)}
              onPointerUp={release}
              onPointerCancel={release}
              onKeyDown={(event) => onSideKeyDown(i, event)}
            >
              {/* The 16px diamond: the corner square's outline and halo, turned 45°. */}
              <span className="absolute top-1/2 left-1/2 size-4 -translate-1/2 rotate-45 border-2 border-text shadow-[0_0_0_var(--spacing-stroke-hairline)_var(--color-crop-halo),inset_0_0_0_var(--spacing-stroke-hairline)_var(--color-crop-halo)] group-focus-visible:outline-2 group-focus-visible:outline-offset-3 group-focus-visible:outline-text group-focus-visible:outline-solid" />
            </button>
          )
        })}
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
