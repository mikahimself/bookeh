import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('sends a signed-out visit to sign in, keeping the address', async ({ page }) => {
    await page.goto('http://localhost:3000/?a=1')

    await expect(page).toHaveURL('http://localhost:3000/login?next=%2F%3Fa%3D1')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
  })

  test('serves the design tokens and switches them with data-theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('http://localhost:3000/login')

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
