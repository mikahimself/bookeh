'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { startTransition, useActionState, type FormEvent } from 'react'

import type { ActionResult } from '@/lib/errors'

import { Button } from '../components/Button'
import { ErrorMessage } from '../components/ErrorMessage'
import { settleAction } from '../components/request'
import { TextField } from '../components/TextField'
import { useToast } from '../components/toast/ToastProvider'
import { signInAction } from './actions'

type State = ActionResult<{ to: string }> | null

export function LoginForm({ next }: { next: string | undefined }) {
  const t = useTranslations()
  const router = useRouter()
  const { show, dismiss } = useToast()
  const [state, formAction, pending] = useActionState(
    async (_: State, formData: FormData): Promise<State> => {
      const result = await settleAction(signInAction(formData))
      // Transport failures are toasts, as everywhere; every other code stays inline.
      if (!result.ok && (result.code === 'NO_CONNECTION' || result.code === 'APP_UPDATED')) {
        show({ kind: 'error', code: result.code })
        return null
      }
      if (result.ok) {
        // An earlier attempt's transport toast must not follow us into the app.
        dismiss()
        router.replace(result.data.to)
      }
      return result
    },
    null,
  )

  // Submitted by hand, not through `action`: a form action resets the fields,
  // and a wrong password would wipe the email too.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next ?? ''} />
      <TextField
        label={t('signIn.email')}
        name="email"
        type="email"
        autoComplete="username"
        required
      />
      <TextField
        label={t('signIn.password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <div>
        <Button variant="primary" type="submit" disabled={pending || state?.ok === true}>
          {t('signIn.submit')}
        </Button>
      </div>
      {/* Unmounted while pending, so a repeated failure is announced again. */}
      {!pending && state?.ok === false && <ErrorMessage>{t(`errors.${state.code}`)}</ErrorMessage>}
    </form>
  )
}
