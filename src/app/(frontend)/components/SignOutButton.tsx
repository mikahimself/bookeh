'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import type { ActionResult } from '@/lib/errors'

import { signOutAction } from '../actions/account'
import { Button } from './Button'
import { useToast } from './toast/ToastProvider'

/**
 * Ends the session and goes to `/login`, also when the session was already
 * gone. A failure is an error toast, like every other failed action.
 */
export function SignOutButton() {
  const t = useTranslations()
  const router = useRouter()
  const { show } = useToast()
  const [pending, startTransition] = useTransition()

  const signOut = () => {
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
      show({ kind: 'error', code: result.code })
    })
  }

  return (
    <Button variant="secondary" onClick={signOut} disabled={pending}>
      {t('signOut.submit')}
    </Button>
  )
}
