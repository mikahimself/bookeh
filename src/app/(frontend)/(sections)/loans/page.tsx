import { requireUser } from '@/lib/payload/context'

/** Loans. Its content arrives with the loans epic. */
export default async function LoansPage() {
  await requireUser()
  return null
}
