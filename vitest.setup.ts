// Setup for the `int` project. Runs before test files import
// `@/payload.config`, which reads DATABASE_URL at module load.
import 'dotenv/config'

import { testDatabaseUrl } from './tests/helpers/testDatabase'

process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL)
