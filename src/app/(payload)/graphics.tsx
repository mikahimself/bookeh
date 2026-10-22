import type { ReactElement } from 'react'

/** Payload admin graphics (`admin.components.graphics`): the bookeh app icon. */

export function Icon(): ReactElement {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icons/icon.svg" alt="" width={24} height={24} style={{ display: 'block' }} />
}

export function Logo(): ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon.svg" alt="" width={48} height={48} style={{ display: 'block' }} />
      <span style={{ fontSize: 32, fontWeight: 300, color: 'var(--theme-text)' }}>bookeh</span>
    </span>
  )
}
