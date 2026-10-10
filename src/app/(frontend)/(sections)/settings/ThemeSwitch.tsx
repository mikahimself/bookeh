'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { setDevicePrefsAction } from '../../actions/prefs'
import { TextSwitch } from '../../components/TextSwitch'
import type { DevicePrefs } from '../../prefs'
import { settled, useReportFailure } from './report'

/**
 * Theme (UX-DR50): a device preference, never on the profile. The client
 * owns `data-theme` on `<html>` (the cookie is httpOnly), so the colours
 * change before the action answers; the cookie makes the server's next
 * render agree. On failure the attribute and the option both revert. The
 * options (`THEMES`) come from the page: `prefs.ts` reads `next/headers`,
 * which a client component cannot import.
 */
export function ThemeSwitch({
  initial,
  options,
}: {
  initial: DevicePrefs['theme']
  options: readonly DevicePrefs['theme'][]
}) {
  const t = useTranslations('settings')
  const report = useReportFailure()
  const [theme, setTheme] = useState(initial)
  const [, startTransition] = useTransition()

  const change = (next: DevicePrefs['theme']) => {
    const previous = theme
    document.documentElement.dataset.theme = next
    setTheme(next)
    startTransition(async () => {
      const result = await settled(setDevicePrefsAction({ theme: next }))
      if (result.ok) return
      document.documentElement.dataset.theme = previous
      setTheme(previous)
      report(result.code)
    })
  }

  return (
    <TextSwitch
      label={t('theme')}
      value={theme}
      options={options.map((value) => ({ value, label: t(`themes.${value}`) }))}
      onChange={change}
    />
  )
}
