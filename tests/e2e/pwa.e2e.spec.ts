import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, seedTestUser, type TestUser } from '../helpers/seedUser'

const BASE = 'http://localhost:3000'

// Its own user, so this spec does not race the others over a shared one.
const user: TestUser = { email: 'pwa-e2e@bookeh.test', password: 'pwa-e2e' }

/** The `theme-color` metas of the page, as `[media, content]`. */
const themeColors = (page: Page) =>
  page
    .locator('head meta[name="theme-color"]')
    .evaluateAll((metas) =>
      metas.map((m) => [m.getAttribute('media'), m.getAttribute('content')] as const),
    )

const withTheme = (page: Page, theme: 'light' | 'dark') =>
  page.context().addCookies([
    {
      name: 'bookeh_prefs',
      // serializeDevicePrefs() output, encoded once more as Next does on set (see frontend.e2e).
      value: encodeURIComponent(
        encodeURIComponent(JSON.stringify({ layout: 'rows', size: 'm', theme, loans: 'person' })),
      ),
      url: `${BASE}/login`,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

test.describe('Installable PWA', () => {
  test.beforeAll(async () => {
    await seedTestUser(user)
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('serves the manifest and its icons signed out, with no redirect', async ({ request }) => {
    const response = await request.get(`${BASE}/manifest.webmanifest`, { maxRedirects: 0 })
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/manifest+json')
    const manifest = (await response.json()) as { icons: { src: string }[] }
    expect(manifest).toMatchObject({
      id: '/',
      name: 'bookeh',
      short_name: 'bookeh',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#FFFFFF',
      background_color: '#FFFFFF',
    })
    expect(manifest.icons.map((i) => i.src)).toEqual([
      '/icons/icon-192.png',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-512.png',
    ])

    for (const src of [
      ...new Set(manifest.icons.map((i) => i.src)),
      '/icons/apple-touch-icon.png',
    ]) {
      const icon = await request.get(`${BASE}${src}`, { maxRedirects: 0 })
      expect(icon.status(), src).toBe(200)
      expect(icon.headers()['content-type'], src).toBe('image/png')
    }
  })

  test('links the manifest and icons, marks the app capable and covers the viewport', async ({
    page,
  }) => {
    await page.goto(`${BASE}/login`)
    const head = page.locator('head')
    await expect(head.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    )
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/icons/apple-touch-icon.png',
    )
    await expect(head.locator('link[rel="icon"]')).toHaveAttribute('href', '/icons/icon-192.png')
    await expect(head.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    )
    await expect(head.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /viewport-fit=cover/,
    )
  })

  test('without the cookie, a light and dark theme-color pair follows the OS', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    expect(await themeColors(page)).toEqual([
      ['(prefers-color-scheme: light)', '#FFFFFF'],
      ['(prefers-color-scheme: dark)', '#14181D'],
    ])
  })

  for (const [theme, color] of [
    ['dark', '#14181D'],
    ['light', '#FFFFFF'],
  ] as const) {
    test(`a ${theme} cookie gives one theme-color, ${color}, with no media`, async ({ page }) => {
      await withTheme(page, theme)
      await page.goto(`${BASE}/login`)
      expect(await themeColors(page)).toEqual([[null, color]])
    })
  }

  test('the start URL opens the collection, with no service worker', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(`${BASE}/`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Collection')
    expect(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
    ).toBe(0)
  })
})
