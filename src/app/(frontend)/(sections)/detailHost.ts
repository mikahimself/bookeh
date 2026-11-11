'use client'

import { createContext } from 'react'

export const HostedDetailContext = createContext(false)
export const FooterContext = createContext<HTMLElement | null>(null)
