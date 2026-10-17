import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Authors } from './collections/Authors'
import { Books } from './collections/Books'
import { isbnIndexes, nameKeyIndexes } from './collections/catalogueIndexes'
import { Copies } from './collections/Copies'
import { Genres } from './collections/Genres'
import { Series } from './collections/Series'
import { UserBooks } from './collections/UserBooks'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { seedFirstUser } from './lib/account/seedFirstUser'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Authors, Books, Copies, Genres, Media, Series, UserBooks, Users],
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // CI sets DATABASE_PUSH=false so the int tests run on the migration-built schema.
    push: process.env.DATABASE_PUSH !== 'false',
    // Applied only when NODE_ENV=production, where the adapter disables push
    // (AD-13): the production container migrates at start, never pushes.
    prodMigrations: migrations,
    afterSchemaInit: [nameKeyIndexes('authors'), nameKeyIndexes('series'), isbnIndexes],
  }),
  sharp,
  plugins: [],
  onInit: seedFirstUser,
})
