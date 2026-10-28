'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useId, useState, useTransition } from 'react'

import { limits } from '@/fields/limits'
import type { ActionResult } from '@/lib/errors'

import { createWishlistAction } from '../../actions/wishlists'
import { Button } from '../../components/Button'
import { ActionLink } from '../../components/Link'
import { settleAction, useReportFailure } from '../../components/request'
import { TextField } from '../../components/TextField'
import { Dialog } from '../../components/ui/Dialog'

/**
 * EXPERIENCE.md, Wishlists, FR-38: "New list" opens a Dialog asking for a
 * name. Create calls `createWishlist()` through its action; success closes
 * the dialog and refreshes the section, which shows the new row. A blank,
 * too long or taken name keeps the dialog open with its message under the
 * field; any other failure is reported and the dialog closes. No Undo, no
 * toast.
 */
export function NewList() {
  const t = useTranslations()
  const router = useRouter()
  const report = useReportFailure()
  const formId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fieldError = (result: Extract<ActionResult<null>, { ok: false }>): string | null => {
    if (result.code === 'NAME_TAKEN') return t('errors.NAME_TAKEN')
    if (result.code === 'VALIDATION' && result.fields?.name === 'TOO_LONG') {
      return t('errors.TOO_LONG')
    }
    if (result.code === 'VALIDATION' && result.fields?.name) return t('settings.nameRequired')
    return null
  }

  const create = () => {
    if (pending || name.trim() === '') return
    startTransition(async () => {
      const result = await settleAction(createWishlistAction(name))
      if (result.ok) {
        startTransition(() => {
          setOpen(false)
          router.refresh()
        })
        return
      }
      const message = fieldError(result)
      if (message !== null) {
        setError(message)
        return
      }
      report(result.code)
      setOpen(false)
    })
  }

  return (
    <>
      <div>
        <ActionLink
          onClick={() => {
            setName('')
            setError(null)
            setOpen(true)
          }}
        >
          {t('wishlists.newList')}
        </ActionLink>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('wishlists.newList')}
        confirm={
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={pending || name.trim() === ''}
          >
            {t('wishlists.create')}
          </Button>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault()
            create()
          }}
        >
          <TextField
            label={t('settings.name')}
            name="name"
            autoComplete="off"
            maxLength={limits.name}
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            error={error}
          />
        </form>
      </Dialog>
    </>
  )
}
