'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { setDevicePrefsAction } from '../actions/prefs'
import { useSavedSwitch } from '../components/useSavedSwitch'
import type { DevicePrefs } from '../prefs'

type Display = Pick<DevicePrefs, 'layout' | 'size'>

type CollectionDisplayValue = Display & {
  setLayout: (layout: Display['layout']) => void
  setSize: (size: Display['size']) => void
}

const CollectionDisplayContext = createContext<CollectionDisplayValue | null>(null)

export function useCollectionDisplay(): CollectionDisplayValue {
  const context = useContext(CollectionDisplayContext)
  if (!context) throw new Error('useCollectionDisplay called outside CollectionDisplayProvider')
  return context
}

/**
 * The collection's layout and size (UX-DR17, UX-DR18): device preferences,
 * seeded from the cookie the page read, so the first paint is right. Shared
 * by the tools row and the list, which are siblings on the page. Each field
 * is its own saved switch, so a failed size save never resets the layout.
 * Display only: nothing here reaches what `ShelfRowsProvider` fetches.
 */
export function CollectionDisplayProvider({
  initial,
  children,
}: {
  initial: Display
  children: ReactNode
}) {
  const [layout, setLayout] = useSavedSwitch(initial.layout, (layout) =>
    setDevicePrefsAction({ layout }),
  )
  const [size, setSize] = useSavedSwitch(initial.size, (size) => setDevicePrefsAction({ size }))

  return (
    <CollectionDisplayContext.Provider value={{ layout, size, setLayout, setSize }}>
      {children}
    </CollectionDisplayContext.Provider>
  )
}
