'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import type { ActionResult, ErrorCode } from '@/lib/errors'

import { signOutAction } from '../actions/account'
import { Button } from './Button'
import { ErrorMessage } from './ErrorMessage'

/** Ends the session and goes to `/login`, also when the session was already gone. */
export function SignOutButton() {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState<ErrorCode | null>(null)

  const signOut = () => {
    // Cleared at once, outside the transition, so a repeated failure remounts
    // the alert and is announced again.
    setFailed(null)
    startTransition(async () => {
      // A rejected call (the network dropped) is a failure, not an error boundary.
      const result = await signOutAction().catch((): ActionResult<null> => ({
        ok: false,
        code: 'INTERNAL',
      }))
      if (result.ok || result.code === 'UNAUTHENTICATED') {
        router.replace('/login')
        return
      }
      setFailed(result.code)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="secondary" onClick={signOut} disabled={pending}>
        {t('signOut.submit')}
      </Button>
      {failed && <ErrorMessage>{t(`errors.${failed}`)}</ErrorMessage>}
    </div>
  )
}
