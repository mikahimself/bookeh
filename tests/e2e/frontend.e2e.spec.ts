import { test, expect, type Page } from '@playwright/test'

test.describe('Frontend', () => {
  test('sends a signed-out visit to sign in, keeping the address', async ({ page }) => {
    await page.goto('http://localhost:3000/?a=1')

    await expect(page).toHaveURL('http://localhost:3000/login?next=%2F%3Fa%3D1')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test.describe('theme from the bookeh_prefs cookie', () => {
    const url = 'http://localhost:3000/login'
    // The painted background of <html>, which reads `--color-background`. Computed
    // colours are normalised to rgb(); the token's own text may be minified (#fff).
    const dark = 'rgb(20, 24, 29)'
    const light = 'rgb(255, 255, 255)'

    const withTheme = (page: Page, theme: 'light' | 'dark') =>
      page.context().addCookies([
        {
          name: 'bookeh_prefs',
          // The wire value: serializeDevicePrefs() output, which Next encodes once more on set.
          // (prefs.ts cannot be imported here: `next/headers` does not resolve under Playwright.)
          value: encodeURIComponent(
            encodeURIComponent(
              JSON.stringify({ layout: 'rows', size: 'm', theme, loans: 'person' }),
            ),
          ),
          url,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ])

    /** Loads the page and returns the `data-theme` of `<html>` in the HTML the server sent. */
    const load = async (page: Page) => {
      const response = await page.goto(url)
      const html = (await response?.text()) ?? ''
      return html.match(/<html[^>]*\sdata-theme="([^"]*)"/)?.[1]
    }

    const token = (page: Page, name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      )

    const background = (page: Page) =>
      page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

    test('serves the accent token', async ({ page }) => {
      await load(page)
      expect(await token(page, '--color-accent')).toBe('#f0604f')
    })

    test('a dark cookie wins over a light OS, from the first byte', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' })
      await withTheme(page, 'dark')
      expect(await load(page)).toBe('dark')
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      expect(await token(page, '--color-background')).toBe('#14181d')
      expect(await background(page)).toBe(dark)
    })

    test('a light cookie wins over a dark OS', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await withTheme(page, 'light')
      expect(await load(page)).toBe('light')
      expect(await background(page)).toBe(light)
    })

    for (const [scheme, expected] of [
      ['dark', dark],
      ['light', light],
    ] as const) {
      test(`without the cookie, data-theme is system and a ${scheme} OS applies`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme })
        expect(await load(page)).toBe('system')
        expect(await background(page)).toBe(expected)
      })
    }
  })
})
