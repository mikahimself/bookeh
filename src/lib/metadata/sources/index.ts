import type { Source } from '../source'
import { finna } from './finna'
import { fixture, usesFixtureSources } from './fixture'
import { google } from './google'
import { openLibrary, openLibraryContact } from './openLibrary'

/**
 * The real sources, in merge order. Open Library joins only when `OPEN_LIBRARY_CONTACT` is
 * set: Open Library asks every client to identify itself, and a source whose credential is
 * absent is left out rather than degraded, so dev, CI and a fresh deploy work without it.
 */
function realSources(): Source[] {
  return [finna, google, ...(openLibraryContact() ? [openLibrary] : [])]
}

// The order is the merge priority (AD-9): the first source that answers wins, later ones gap-fill.
// Under `BOOKEH_SOURCES=fixture` (e2e, never production) the fixture source is the only one.
export const sources: readonly Source[] = usesFixtureSources() ? [fixture] : realSources()
