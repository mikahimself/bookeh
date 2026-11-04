// Setup for the `int` project. Runs before test files import
// `@/payload.config`, which reads DATABASE_URL at module load.
import 'dotenv/config'

import path from 'node:path'

import { testDatabaseUrl } from './tests/helpers/testDatabase'

process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL)

// Push off: `scripts/test-db.ts` has migrated bookeh_test before this lane
// (AD-13). DATABASE_PUSH=true opts in, and the next default run is refused
// until `npm run test:reset`.
process.env.DATABASE_PUSH ||= 'false'

// The int lane must never seed bookeh_test with the owner's real account
// from `.env`; a spec that needs the variables stubs them.
delete process.env.SEED_EMAIL
delete process.env.SEED_PASSWORD

// Media files of the int lane go to their own directory, so the sweep in
// `onInit` never touches the dev `media` directory.
process.env.MEDIA_DIR = path.resolve('media-test')

// The int lane always runs the full source fan-out, Open Library included, so
// what it verifies does not depend on the developer's `.env` or on CI's
// narrower one. The value only has to be non-empty; no request leaves the
// lane, because every spec that asks the sources stubs `fetch`.
process.env.OPEN_LIBRARY_CONTACT = 'int-tests@bookeh.invalid'
