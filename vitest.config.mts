import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.unit.spec.ts'],
          // No database in this lane. An unreachable URL makes a unit spec
          // that loads Payload fail loudly instead of inheriting CI's
          // job-wide `bookeh` URL.
          env: { DATABASE_URL: 'postgres://unit-tests-have-no-database.invalid/none' },
        },
      },
      {
        extends: true,
        test: {
          name: 'int',
          environment: 'node',
          // Rewrites DATABASE_URL to bookeh_test before Payload loads.
          setupFiles: ['./vitest.setup.ts'],
          include: ['tests/int/**/*.int.spec.ts'],
          // Each file calls getPayload(), which pushes the schema in dev. Two
          // workers pushing at once on an empty database race on enum
          // creation; the harness does not change that.
          fileParallelism: false,
        },
      },
    ],
  },
})
