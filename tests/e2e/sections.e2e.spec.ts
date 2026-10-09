import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, seedTestUser, type TestUser } from '../helpers/seedUser'
import {
  longAnimations,
  probeViewTransitions,
  transitionOfType,
  type Recorded,
} from '../helpers/viewTransitions'

const BASE = 'http://localhost:3000'

// Its own user, so this spec does not race `admin.e2e` over the shared one.
const user: TestUser = { email: 'sections-e2e@bookeh.test', password: 'sections-e2e' }

/** The settled record of the view transition that animated `pseudo`. */
async function transitionAnimating(page: Page, pseudo: string): Promise<Recorded> {
  const handle = await page.waitForFunction(
    (p) =>
      (window as unknown as { __vt: Recorded[] }).__vt.find(
        (r) => r.ready && r.animations.some((a) => a.pseudo === p),
      ),
    pseudo,
  )
  return (await handle.jsonValue()) as Recorded
}

/** The settled record of a transition that slid an old snapshot other than `task-closing` for 200 ms. */
async function taskExitTransition(page: Page): Promise<Recorded> {
  const handle = await page.waitForFunction(() =>
    (window as unknown as { __vt: Recorded[] }).__vt.find(
      (r) =>
        r.ready &&
        r.animations.some(
          (a) =>
            a.pseudo.startsWith('::view-transition-old(') &&
            a.pseudo !== '::view-transition-old(task-closing)' &&
            a.duration === 200,
        ),
    ),
  )
  return (await handle.jsonValue()) as Recorded
}

async function signIn(page: Page) {
  await page.goto(`${BASE}/login`)
  await fillSignIn(page)
  await page.waitForURL(`${BASE}/`)
}

async function fillSignIn(page: Page) {
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const sectionLinks = (page: Page) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('link')

/**
 * Reaches `/loans` with the task's client code already loaded. On a fresh
 * document the first Scan book tap can suspend on that chunk: the route then
 * commits twice, and the first commit claims the `task-open` type, since
 * React queues types per root. Seen on the dev server, where every module is
 * its own chunk; the production build shares that chunk with the layout.
 */
async function loansWithTaskLoaded(page: Page) {
  await page.goto(`${BASE}/scan`)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page).toHaveURL(`${BASE}/`)
  await sectionLinks(page).filter({ hasText: 'Loans' }).click()
  await expect(page).toHaveURL(`${BASE}/loans`)
}

test.describe('Section shell', () => {
  test.beforeAll(async () => {
    await seedTestUser(user)
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  for (const path of ['/wishlists', '/loans', '/settings', '/scan']) {
    test(`sends a signed-out request for ${path} to sign in`, async ({ request }) => {
      const response = await request.get(`${BASE}${path}`, { maxRedirects: 0 })
      expect(response.status()).toBe(307)
      expect(response.headers()['location']).toBe(`/login?next=${encodeURIComponent(path)}`)
    })
  }

  test('a task reached through sign-in has no in-app entry: the X goes home', async ({ page }) => {
    await page.goto(`${BASE}/scan`)
    await expect(page).toHaveURL(`${BASE}/login?next=%2Fscan`)
    await fillSignIn(page)
    await expect(page).toHaveURL(`${BASE}/scan`)

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL(`${BASE}/`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Collection')
  })

  test('on the phone: the current section leads a clipped row, Scan book pinned', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page)
    await page.goto(`${BASE}/loans`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loans')
    await expect(sectionLinks(page)).toHaveText(['Wishlists', 'Settings', 'Collection'])

    // The row runs off the right edge and is clipped there, with no page scroll.
    const last = await sectionLinks(page).last().boundingBox()
    expect(last!.x + last!.width).toBeGreaterThan(390)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
    ).toBe(true)

    const scan = page.getByRole('link', { name: 'Scan book' })
    await expect(scan).toHaveCount(1)
    await expect(scan).toBeVisible()
    const box = (await scan.boundingBox())!
    expect(box.x).toBeCloseTo(20, 0)
    expect(box.width).toBeCloseTo(390 - 2 * 20, 0)
    expect(box.y + box.height).toBeCloseTo(844 - 16, 0)
  })

  test('on wide screens: all four headings in one row, Scan book top right', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page)

    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toHaveText('Collection')
    await expect(sectionLinks(page)).toHaveText(['Loans', 'Wishlists', 'Settings'])

    const scan = page.getByRole('link', { name: 'Scan book' })
    await expect(scan).toHaveCount(1)
    const scanBox = (await scan.boundingBox())!

    const boxes = [
      (await heading.boundingBox())!,
      ...(await Promise.all(
        (await sectionLinks(page).all()).map(async (link) => (await link.boundingBox())!),
      )),
    ]
    for (const box of boxes) {
      expect(box.y).toBeCloseTo(boxes[0].y, 0)
      // Fully drawn: left of Scan book, nothing clipped.
      expect(box.x + box.width).toBeLessThanOrEqual(scanBox.x)
    }

    const navBox = (await page.getByRole('navigation', { name: 'Sections' }).boundingBox())!
    expect(scanBox.y).toBeLessThan(navBox.y + navBox.height)
    expect(scanBox.x + scanBox.width).toBeCloseTo(1280 - 28, 0)
  })

  test('at the narrowest wide window: one row, Scan book top right, no page scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 })
    await signIn(page)

    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toHaveText('Collection')
    const boxes = [
      (await heading.boundingBox())!,
      ...(await Promise.all(
        (await sectionLinks(page).all()).map(async (link) => (await link.boundingBox())!),
      )),
    ]
    expect(boxes).toHaveLength(4)
    for (const box of boxes) expect(box.y).toBeCloseTo(boxes[0].y, 0)

    const scan = page.getByRole('link', { name: 'Scan book' })
    await expect(scan).toHaveCount(1)
    await expect(scan).toBeVisible()
    const scanBox = (await scan.boundingBox())!
    const navBox = (await page.getByRole('navigation', { name: 'Sections' }).boundingBox())!
    expect(scanBox.y).toBeLessThan(navBox.y + navBox.height)
    expect(scanBox.x + scanBox.width).toBeCloseTo(900 - 28, 0)

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === document.documentElement.clientWidth,
      ),
    ).toBe(true)
  })

  test('a heading changes section and the change is announced', async ({ page }) => {
    await signIn(page)
    const live = page.locator('p[aria-live="polite"]')
    await expect(live).toHaveText('Collection')

    await sectionLinks(page).filter({ hasText: 'Wishlists' }).click()

    await expect(page).toHaveURL(`${BASE}/wishlists`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wishlists')
    await expect(live).toHaveText('Wishlists')
  })

  test('Scan book opens the task with a slide; the X goes back, or home when opened directly', async ({
    page,
  }) => {
    await page.addInitScript(probeViewTransitions)
    await signIn(page)
    await loansWithTaskLoaded(page)

    await page.getByRole('link', { name: 'Scan book' }).click()
    await expect(page).toHaveURL(`${BASE}/scan`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Scan')

    const opened = await transitionOfType(page, 'task-open')
    // The task's own snapshot slides in over the motion default.
    expect(
      opened.animations.some(
        (a) => a.pseudo.startsWith('::view-transition-new(') && a.duration === 200,
      ),
    ).toBe(true)

    // The X goes back to the section, sliding the task away in a view
    // transition it starts itself.
    await page.getByRole('button', { name: 'Close' }).click()
    const closed = await transitionAnimating(page, '::view-transition-old(task-closing)')
    expect(
      closed.animations.find((a) => a.pseudo === '::view-transition-old(task-closing)')!.duration,
    ).toBe(200)
    await expect(page).toHaveURL(`${BASE}/loans`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loans')

    // Browser Back leaves the task at once (no slide is asserted).
    await page.getByRole('link', { name: 'Scan book' }).click()
    await expect(page).toHaveURL(`${BASE}/scan`)
    await page.goBack()
    await expect(page).toHaveURL(`${BASE}/loans`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loans')

    // Opened directly, the X replaces to `/`: a normal transition, so the
    // task's own `exit="task-exit"` slides it away.
    await page.goto(`${BASE}/scan`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Scan')
    await page.getByRole('button', { name: 'Close' }).click()
    await taskExitTransition(page)
    await expect(page).toHaveURL(`${BASE}/`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Collection')
  })

  test('without view transitions the X still goes back', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Document.prototype as unknown as { startViewTransition?: unknown })
        .startViewTransition
    })
    await signIn(page)
    await page.goto(`${BASE}/loans`)

    await page.getByRole('link', { name: 'Scan book' }).click()
    await expect(page).toHaveURL(`${BASE}/scan`)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL(`${BASE}/loans`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loans')
  })

  test('under reduce motion the task opens and closes at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(probeViewTransitions)
    await signIn(page)
    await loansWithTaskLoaded(page)

    await page.getByRole('link', { name: 'Scan book' }).click()
    await expect(page).toHaveURL(`${BASE}/scan`)
    await transitionOfType(page, 'task-open')
    expect(await longAnimations(page)).toEqual([])

    // The X starts no transition of its own.
    const started = () =>
      page.evaluate(() => (window as unknown as { __vt: Recorded[] }).__vt.length)
    const before = await started()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL(`${BASE}/loans`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loans')
    expect(await started()).toBe(before)
    expect(await longAnimations(page)).toEqual([])
  })

  test('Settings holds Sign out, which signs out to /login', async ({ page }) => {
    await signIn(page)
    await page.goto(`${BASE}/settings`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(`${BASE}/login`)
  })
})
