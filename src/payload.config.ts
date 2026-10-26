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
import { Loans, openLoanIndex } from './collections/Loans'
import { Locations } from './collections/Locations'
import { People } from './collections/People'
import { Series } from './collections/Series'
import { UserBooks } from './collections/UserBooks'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { seedFirstUser } from './lib/account/seedFirstUser'
import { sweepOrphanMedia } from './lib/catalogue/covers'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: '- bookeh',
      icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/icons/icon.svg' }],
      // The OG image route cannot load the Icon's relative image, and the tailnet
      // back office is never shared, so no OG image; the defaults say "Payload".
      defaultOGImageType: 'off',
      openGraph: { siteName: 'bookeh', description: 'bookeh back office' },
    },
    components: {
      graphics: {
        Logo: '/app/(payload)/graphics#Logo',
        Icon: '/app/(payload)/graphics#Icon',
      },
    },
  },
  collections: [
    Authors,
    Books,
    Copies,
    Genres,
    Loans,
    Locations,
    Media,
    People,
    Series,
    UserBooks,
    Users,
  ],
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    // Dev pushes. The int and e2e lanes default DATABASE_PUSH to 'false' and run on
    // bookeh_test built by migrations (scripts/test-db.ts, AD-13).
    push: process.env.DATABASE_PUSH !== 'false',
    // Applied only when NODE_ENV=production, where the adapter disables push
    // (AD-13): the production container migrates at start, never pushes.
    prodMigrations: migrations,
    afterSchemaInit: [
      nameKeyIndexes('authors'),
      nameKeyIndexes('series'),
      isbnIndexes,
      openLoanIndex,
    ],
  }),
  sharp,
  plugins: [],
  onInit: async (payload) => {
    await seedFirstUser(payload)
    await sweepOrphanMedia(payload)
  },
})
