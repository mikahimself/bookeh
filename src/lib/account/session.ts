import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import { endSession, startSession } from '@/lib/payload/session'

/**
 * Signs in with email and password. Every failure is `WRONG_CREDENTIALS`,
 * whether or not the account exists, and a locked account too (UX-DR39,
 * NFR-5).
 */
export async function signIn(email: string, password: string): Promise<void> {
  if (email.trim() === '' || password.trim() === '') throw new DomainError('WRONG_CREDENTIALS')
  if (!(await startSession(email, password))) throw new DomainError('WRONG_CREDENTIALS')
}

/** Ends the signed-in user's current session. */
export async function signOut(ctx: Context): Promise<void> {
  await endSession(ctx)
}
