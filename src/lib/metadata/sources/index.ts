import type { Source } from '../source'
import { finna } from './finna'
import { fixture, usesFixtureSources } from './fixture'
import { google } from './google'
import { hardcover, hardcoverToken } from './hardcover'
import { openLibrary, openLibraryContact } from './openLibrary'

/**
 * The real sources, in merge order. Open Library requires its identifying contact;
 * Hardcover requires its catalogue token. Missing credentials keep those sources out
 * of development, CI and a fresh deploy.
 */
function realSources(): Source[] {
  return [
    finna,
    google,
    ...(openLibraryContact() ? [openLibrary] : []),
    ...(hardcoverToken() ? [hardcover] : []),
  ]
}

// The order is the merge priority (AD-9): the first source that answers wins, later ones gap-fill.
// Under `BOOKEH_SOURCES=fixture` (e2e, never production) the fixture source is the only one.
export const sources: readonly Source[] = usesFixtureSources() ? [fixture] : realSources()
