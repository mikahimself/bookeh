'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { setDevicePrefsAction } from '../../actions/prefs'
import { TextSwitch } from '../../components/TextSwitch'
import { useSavedSwitch } from '../../components/useSavedSwitch'
import type { DevicePrefs } from '../../prefs'

/**
 * The Loans order (EXPERIENCE.md, Loans; DESIGN.md, Text switch): by person
 * or by date, a device preference (spine, Device preferences) seeded from the
 * cookie the page read, so the first paint is right. Both orders arrive
 * server-rendered; the switch shows the chosen one at once and saves on this
 * device, and a failed save is reported and puts the switch back. The options
 * are inline: `prefs.ts` reads `next/headers`, which a client component
 * cannot import.
 */
export function LoansOrder({
  initial,
  byPerson,
  byDate,
}: {
  initial: DevicePrefs['loans']
  byPerson: ReactNode
  byDate: ReactNode
}) {
  const t = useTranslations('loans')
  const [order, setOrder] = useSavedSwitch(initial, (loans) => setDevicePrefsAction({ loans }))

  return (
    <>
      <div className="pt-4">
        <TextSwitch
          label={t('order')}
          value={order}
          options={[
            { value: 'person', label: t('orders.person') },
            { value: 'date', label: t('orders.date') },
          ]}
          onChange={setOrder}
        />
      </div>
      {order === 'person' ? byPerson : byDate}
    </>
  )
}
