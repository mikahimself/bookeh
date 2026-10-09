import { test, expect, Page } from '@playwright/test'

test.describe('Frontend', () => {
  let page: Page

  test.beforeAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext()
    page = await context.newPage()
  })

  test('can go on homepage', async ({ page }) => {
    await page.goto('http://localhost:3000')

    await expect(page).toHaveTitle(/Payload Blank Template/)

    const heading = page.locator('h1').first()

    await expect(heading).toHaveText('Welcome to your new project.')
  })

  test('serves the design tokens and switches them with data-theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('http://localhost:3000')

    const token = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      )

    expect(await token('--color-accent')).toBe('#f0604f')

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    expect(await token('--color-background')).toBe('#14181d')
  })
})
