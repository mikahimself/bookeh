/**
 * Derives the integration-test database URL from the dev `DATABASE_URL`:
 * same host, credentials and query string, database `bookeh_test`.
 */
export function testDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL is not set; integration tests derive bookeh_test from it.')
  }
  const parsed = new URL(url)
  parsed.pathname = '/bookeh_test'
  return parsed.toString()
}
