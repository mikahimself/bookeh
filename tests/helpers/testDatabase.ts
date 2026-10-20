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

/**
 * Throws unless `url` names the `bookeh_test` database, so a script that
 * deletes rows never runs on the dev database.
 */
export function assertTestDatabase(url: string | undefined): void {
  const pathname = url && URL.canParse(url) ? new URL(url).pathname : undefined
  if (pathname !== '/bookeh_test') {
    throw new Error(
      `Refusing to run: DATABASE_URL must name bookeh_test, not ${pathname ?? 'nothing'}`,
    )
  }
}
