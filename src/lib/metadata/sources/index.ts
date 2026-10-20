import type { Source } from '../source'
import { finna } from './finna'
import { fixture, usesFixtureSources } from './fixture'
import { google } from './google'

// The order is the merge priority (AD-9): the first source that answers wins, later ones gap-fill.
// Under `BOOKEH_SOURCES=fixture` (e2e, never production) the fixture source is the only one.
export const sources: readonly Source[] = usesFixtureSources() ? [fixture] : [finna, google]
