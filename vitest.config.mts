import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Each file calls getPayload(), which pushes the schema in dev. Two
    // workers pushing at once on an empty database race on enum creation.
    // Revisit with Story 1.4's harness.
    fileParallelism: false,
  },
})
