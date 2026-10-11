import type { Source } from '../source'
import { finna } from './finna'
import { google } from './google'

// The order is the merge priority (AD-9): the first source that answers wins, later ones gap-fill.
export const sources: readonly Source[] = [finna, google]
