'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Corners } from '@/lib/catalogue/corners'
import type { ErrorCode } from '@/lib/errors'

import { Button } from '../../../components/Button'
import { Cover } from '../../../components/Cover'
import { CornerCrop, type CornerCropResult } from '../../../components/cornerCrop/CornerCrop'
import { warpPreview } from '../../../components/cornerCrop/warpPreview'
import { ErrorMessage } from '../../../components/ErrorMessage'

/**
 * The cover change on Edit book: an upload (the crop step's JPEG and its
 * corners, with the local `blob:` URL of its straightened preview), `null`
 * to remove the saved cover. No change is `undefined`.
 */
export type CoverChange = { image: Blob; corners: Corners; preview: string } | null

const COVER_MESSAGES = {
  NOT_AN_IMAGE: 'errors.NOT_AN_IMAGE',
  IMAGE_TOO_LARGE: 'errors.IMAGE_TOO_LARGE',
  INVALID_CORNERS: 'errors.INVALID_CORNERS',
  COVER_FAILED: 'errors.COVER_FAILED',
} as const satisfies Partial<Record<ErrorCode, string>>

/** A code shown under the cover rather than in a toast. */
export const isCoverCode = (code: ErrorCode): code is keyof typeof COVER_MESSAGES =>
  Object.hasOwn(COVER_MESSAGES, code)

/**
 * EXPERIENCE.md, Edit book (D-4, UX-DR47a): the header's cover, with
 * `children` (title, author, source) beside it. When `editable`, "Add cover"
 * under them while no cover is shown, else "Replace cover" and a destructive
 * "Remove cover", which takes effect on Save. A chosen file goes through the
 * crop step; Use shows `warpPreview()`'s straightened preview in place of
 * the cover. Remove on an upload over no saved cover just drops the upload.
 * `mark`, a code from the crop step or a rejected Save, shows under the
 * cover; choosing a file clears it. The preview's object URL is revoked once
 * replaced or unmounted.
 */
export function CoverField({
  saved,
  title,
  editable,
  pending,
  change,
  onChange,
  mark,
  onMark,
  children,
}: {
  /** The saved cover's URL, `null` without one. */
  saved: string | null
  title: string
  editable: boolean
  /** Save in flight: a change now would miss the request. */
  pending: boolean
  change: CoverChange | undefined
  onChange: (change: CoverChange | undefined) => void
  mark: ErrorCode | undefined
  onMark: (code: ErrorCode | undefined) => void
  children: ReactNode
}) {
  const t = useTranslations()
  const input = useRef<HTMLInputElement | null>(null)
  const choose = useRef<HTMLButtonElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const alive = useRef(false)
  const preview = change?.preview

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (preview === undefined) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const shown = change === undefined ? saved : (change?.preview ?? null)

  const use = async ({ image, corners }: CornerCropResult) => {
    setFile(null)
    const blob = await warpPreview(image, corners)
    if (!alive.current) return
    if (!blob) {
      onMark('NOT_AN_IMAGE')
      return
    }
    onChange({ image, corners, preview: URL.createObjectURL(blob) })
  }

  const message =
    mark === undefined
      ? undefined
      : isCoverCode(mark)
        ? t(COVER_MESSAGES[mark])
        : t('editBook.checkField')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-4">
        <div className="w-cover-detail shrink-0">
          <Cover src={shown} title={title} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">{children}</div>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button
                ref={choose}
                variant="secondary"
                disabled={pending}
                onClick={() => input.current?.click()}
              >
                {t(shown === null ? 'editBook.addCover' : 'editBook.replaceCover')}
              </Button>
              {shown !== null && (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    onChange(saved === null ? undefined : null)
                    // The button goes with the cover; focus stays in the row.
                    choose.current?.focus()
                  }}
                >
                  {t('editBook.removeCover')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {message !== undefined && <ErrorMessage>{message}</ErrorMessage>}
      {editable && (
        <>
          {/* No `capture`: the phone offers the camera and the library. */}
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            tabIndex={-1}
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null
              // So the same file can be chosen again.
              event.target.value = ''
              if (!chosen) return
              onMark(undefined)
              setFile(chosen)
            }}
          />
          <CornerCrop
            file={file}
            onUse={(result) => void use(result)}
            onCancel={() => setFile(null)}
            onReject={(code) => {
              setFile(null)
              onMark(code)
            }}
          />
        </>
      )}
    </div>
  )
}
