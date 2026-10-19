// Setup for the `int` project. Runs before test files import
// `@/payload.config`, which reads DATABASE_URL at module load.
import 'dotenv/config'

import path from 'node:path'

import { testDatabaseUrl } from './tests/helpers/testDatabase'

process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL)

// The int lane must never seed bookeh_test with the owner's real account
// from `.env`; a spec that needs the variables stubs them.
delete process.env.SEED_EMAIL
delete process.env.SEED_PASSWORD

// Media files of the int lane go to their own directory, so the sweep in
// `onInit` never touches the dev `media` directory.
process.env.MEDIA_DIR = path.resolve('media-test')
