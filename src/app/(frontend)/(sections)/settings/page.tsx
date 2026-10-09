import { requireUser } from '@/lib/payload/context'

import { SignOutButton } from '../../components/SignOutButton'

/** Settings. Sign out lives here (EXPERIENCE.md, Settings); 1.23 adds the rest. */
export default async function SettingsPage() {
  await requireUser()
  return (
    <div className="px-page-margin-phone pt-7 wide:px-page-margin">
      <SignOutButton />
    </div>
  )
}
