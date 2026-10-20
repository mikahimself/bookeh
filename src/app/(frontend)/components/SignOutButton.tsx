'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { signOutAction } from '../actions/account'
import { Button } from './Button'
import { settleAction } from './request'
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
      const result = await settleAction(signOutAction())
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
