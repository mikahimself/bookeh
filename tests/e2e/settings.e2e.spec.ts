import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, seedTestUser, type TestUser } from '../helpers/seedUser'

const BASE = 'http://localhost:3000'

// Its own user, so this spec does not race the others over a shared one.
const user: TestUser = { email: 'settings-e2e@bookeh.test', password: 'settings-e2e' }

async function signIn(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${BASE}/`)
}

const group = (page: Page, name: string) => page.getByRole('group', { name })

const pressed = (page: Page, groupName: string, name: string) =>
  expect(group(page, groupName).getByRole('button', { name })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

/** The server actions posted from the page, recorded from `page.on('request')`. */
function recordPosts(page: Page): string[] {
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url() === `${BASE}/settings`) {
      posts.push(request.url())
    }
  })
  return posts
}

/** The `theme-color` metas of the page, as `[media, content]`. */
const themeColors = (page: Page) =>
  page
    .locator('head meta[name="theme-color"]')
    .evaluateAll((metas) =>
      metas.map((m) => [m.getAttribute('media'), m.getAttribute('content')] as const),
    )

test.describe('Settings', () => {
  // Reseeded per test: a renamed or re-languaged user never reaches the next test.
  test.beforeEach(async ({ page }) => {
    await seedTestUser(user)
    await signIn(page)
    await page.goto(`${BASE}/settings`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('shows the profile, both switches and Sign out, with no password field', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Profile',
      'Language',
      'Theme',
      'Visibility',
    ])
    await expect(page.getByLabel('Display name')).toHaveValue('E2E Admin')

    // The email is text, never an input.
    await expect(page.getByText(user.email, { exact: true })).toBeVisible()
    await expect(page.locator(`input[value="${user.email}"]`)).toHaveCount(0)
    await expect(page.locator('input[type="password"]')).toHaveCount(0)

    const language = group(page, 'Language')
    await expect(language.getByRole('button')).toHaveText(['English', 'Suomi'])
    await pressed(page, 'Language', 'English')
    const theme = group(page, 'Theme')
    await expect(theme.getByRole('button')).toHaveText(['Light', 'Dark', 'System'])
    await pressed(page, 'Theme', 'System')

    // A fresh user: the visibility defaults are pressed.
    const profileVisibility = group(page, 'Profile')
    await expect(profileVisibility.getByRole('button')).toHaveText(['Public', 'Hidden'])
    await pressed(page, 'Profile', 'Hidden')
    const collectionVisibility = group(page, 'Collection')
    await expect(collectionVisibility.getByRole('button')).toHaveText(['Open', 'Closed'])
    await pressed(page, 'Collection', 'Closed')

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('lays the first column out in a two-column grid on wide, one column on the phone', async ({
    page,
  }) => {
    const column = page.getByRole('heading', { level: 2, name: 'Profile' }).locator('xpath=../..')
    const wrapper = column.locator('xpath=..')

    await page.setViewportSize({ width: 1280, height: 800 })
    const wide = await column.boundingBox()
    expect(wide?.width).toBeLessThan(640)
    const tracks = await wrapper.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(tracks.split(' ')).toHaveLength(2)

    await page.setViewportSize({ width: 390, height: 844 })
    const phone = await column.boundingBox()
    expect(phone?.x).toBe(20)
    expect(phone?.width).toBe(390 - 2 * 20)
    expect(await wrapper.evaluate((el) => getComputedStyle(el).display)).toBe('block')
    await expect(page.getByRole('link', { name: 'Scan book' })).toBeVisible()
  })

  test('posts nothing for an unchanged name or an already chosen option', async ({ page }) => {
    const posts = recordPosts(page)
    const field = page.getByLabel('Display name')

    await field.fill('  E2E Admin ')
    await field.blur()
    await page.waitForTimeout(300)
    expect(posts).toEqual([])
    await expect(field).toHaveValue('  E2E Admin ')

    await group(page, 'Language').getByRole('button', { name: 'English' }).click()
    await group(page, 'Theme').getByRole('button', { name: 'System' }).click()
    await page.waitForTimeout(300)
    expect(posts).toEqual([])
    await pressed(page, 'Language', 'English')
    await pressed(page, 'Theme', 'System')
  })

  test('rejects a blank name under the field and saves a typed one on blur', async ({ page }) => {
    const field = page.getByLabel('Display name')

    await field.fill('   ')
    await field.blur()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Enter a name.')).toBeVisible()
    await expect(field).toHaveValue('   ')

    await field.fill('  Settings Tester ')
    await field.press('Enter')
    await expect(field).toHaveValue('Settings Tester')
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Enter a name.')).toHaveCount(0)

    await page.reload()
    await expect(page.getByLabel('Display name')).toHaveValue('Settings Tester')
  })

  test('a failed name save shows the error toast and keeps the typed text', async ({ page }) => {
    await page.route(`${BASE}/settings`, (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    const field = page.getByLabel('Display name')

    await field.fill('Unsaved Name')
    await field.blur()

    await expect(page.getByText("Didn't work. Try again.")).toBeVisible()
    await expect(field).toHaveValue('Unsaved Name')
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
  })

  test('dark applies at once and is served on the next load', async ({ page }) => {
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'system')

    // The action's request is held until the attribute has been checked.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`${BASE}/settings`, async (route) => {
      if (route.request().method() === 'POST') await held
      await route.continue()
    })
    const answered = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url() === `${BASE}/settings`,
    )

    await group(page, 'Theme').getByRole('button', { name: 'Dark' }).click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await pressed(page, 'Theme', 'Dark')
    release()
    await answered
    await page.unroute(`${BASE}/settings`)

    // The cookie re-rendered the layout: one theme colour, the dark one, no media.
    await expect.poll(() => themeColors(page)).toEqual([[null, '#14181D']])

    const response = await page.reload()
    const served = (await response?.text()) ?? ''
    expect(served.match(/<html[^>]*\sdata-theme="([^"]*)"/)?.[1]).toBe('dark')
    await pressed(page, 'Theme', 'Dark')
  })

  test('Suomi re-renders the interface in Finnish without a reload, and after one', async ({
    page,
  }) => {
    // A marker a full page load would drop.
    await page.evaluate(() => {
      ;(window as unknown as { __keep?: number }).__keep = 1
    })

    await group(page, 'Language').getByRole('button', { name: 'Suomi' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Asetukset')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi')
    await pressed(page, 'Kieli', 'Suomi')
    expect(await page.evaluate(() => (window as unknown as { __keep?: number }).__keep)).toBe(1)

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Asetukset')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fi')
  })
  test('a failed language change restores the old option and shows an error toast', async ({
    page,
  }) => {
    await page.route(`${BASE}/settings`, (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    await group(page, 'Language').getByRole('button', { name: 'Suomi' }).click()
    await expect(page.getByText("Didn't work. Try again.")).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
    await pressed(page, 'Language', 'English')
    await expect(group(page, 'Language').getByRole('button', { name: 'Suomi' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('a failed theme change reverts the attribute and the option and shows an error toast', async ({
    page,
  }) => {
    await page.route(`${BASE}/settings`, (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    await group(page, 'Theme').getByRole('button', { name: 'Dark' }).click()
    await expect(page.getByText("Didn't work. Try again.")).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'system')
    await pressed(page, 'Theme', 'System')
    await expect(group(page, 'Theme').getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('visibility changes apply at once and survive a reload', async ({ page }) => {
    const saved = () =>
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url() === `${BASE}/settings`,
      )

    // The action's request is held until the optimistic press has been checked.
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(`${BASE}/settings`, async (route) => {
      if (route.request().method() === 'POST') await held
      await route.continue()
    })
    let answered = saved()
    await group(page, 'Profile').getByRole('button', { name: 'Public' }).click()
    await pressed(page, 'Profile', 'Public')
    release()
    await answered
    await page.unroute(`${BASE}/settings`)

    answered = saved()
    await group(page, 'Collection').getByRole('button', { name: 'Open' }).click()
    await pressed(page, 'Collection', 'Open')
    await answered

    await page.reload()
    await pressed(page, 'Profile', 'Public')
    await pressed(page, 'Collection', 'Open')
  })

  test('a failed visibility change restores the old option and shows an error toast', async ({
    page,
  }) => {
    await page.route(`${BASE}/settings`, (route) =>
      route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    await group(page, 'Profile').getByRole('button', { name: 'Public' }).click()
    await expect(page.getByText("Didn't work. Try again.")).toBeVisible()
    await pressed(page, 'Profile', 'Hidden')
    await expect(group(page, 'Profile').getByRole('button', { name: 'Public' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('a change after the session is gone goes to sign in, returning to Settings', async ({
    page,
  }) => {
    await page.context().clearCookies()
    await group(page, 'Theme').getByRole('button', { name: 'Dark' }).click()
    await expect(page).toHaveURL(`${BASE}/login?next=%2Fsettings`)
  })
})
