// Setup for the `int` project. Runs before test files import
// `@/payload.config`, which reads DATABASE_URL at module load.
import 'dotenv/config'

import { testDatabaseUrl } from './tests/helpers/testDatabase'

process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL)

// The int lane must never seed bookeh_test with the owner's real account
// from `.env`; a spec that needs the variables stubs them.
delete process.env.SEED_EMAIL
delete process.env.SEED_PASSWORD
