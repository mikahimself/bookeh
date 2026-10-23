'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { setDevicePrefsAction } from '../../actions/prefs'
import { TextSwitch } from '../../components/TextSwitch'
import { useSavedSwitch } from '../../components/useSavedSwitch'
import type { DevicePrefs } from '../../prefs'

/**
 * Theme (UX-DR50): a device preference, never on the profile. The client
 * owns `data-theme` on `<html>` (the cookie is httpOnly): it follows the
 * shown option, so the colours change before the action answers and return
 * with the option when the save fails; the cookie makes the server's next
 * render agree. The options (`THEMES`) come from the page: `prefs.ts` reads
 * `next/headers`, which a client component cannot import.
 */
export function ThemeSwitch({
  initial,
  options,
}: {
  initial: DevicePrefs['theme']
  options: readonly DevicePrefs['theme'][]
}) {
  const t = useTranslations('settings')
  const [theme, change] = useSavedSwitch(initial, (theme) => setDevicePrefsAction({ theme }))
  // Every change after mount: the server rendered `data-theme`, and a cached
  // render's `initial` may be older than it.
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <TextSwitch
      label={t('theme')}
      value={theme}
      options={options.map((value) => ({ value, label: t(`themes.${value}`) }))}
      onChange={change}
    />
  )
}
