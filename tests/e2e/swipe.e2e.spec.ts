import { expect, test, type Page } from '@playwright/test'

import { cleanupTestUser, seedTestUser, type TestUser } from '../helpers/seedUser'
import {
  longAnimations,
  probeViewTransitions,
  transitionOfType,
  type Recorded,
} from '../helpers/viewTransitions'

const BASE = 'http://localhost:3000'
const PHONE = { width: 390, height: 844 }

// Its own user, so this spec does not race the others over a shared one.
const user: TestUser = { email: 'swipe-e2e@bookeh.test', password: 'swipe-e2e' }

test.use({ hasTouch: true, viewport: PHONE })

type Point = { x: number; y: number }

/** Real touches through CDP: one finger from `from` to `to`, lifted at the end. */
async function swipe(page: Page, from: Point, to: Point) {
  const cdp = await page.context().newCDPSession(page)
  const steps = 6
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let i = 1; i <= steps; i++) {
    const at = {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

const middle = PHONE.height / 2
const left = (page: Page) => swipe(page, { x: 300, y: middle }, { x: 100, y: middle + 10 })
const right = (page: Page) => swipe(page, { x: 100, y: middle }, { x: 300, y: middle })

async function signIn(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${BASE}/`)
}

/** Opens `path` and waits until React has hydrated the shell, so the swipe listener is on. */
async function open(page: Page, path: string, heading: string) {
  await page.goto(`${BASE}${path}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
  await page.waitForFunction(() => {
    const bar = document.querySelector('[data-pinned-bottom]')
    return !!bar && Object.keys(bar).some((key) => key.startsWith('__reactFiber'))
  })
}

async function expectSection(page: Page, path: string, heading: string) {
  await expect(page).toHaveURL(`${BASE}${path}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
  await expect(page.locator('p[aria-live="polite"]')).toHaveText(heading)
}

/** Nothing happens: after a moment the page is still where it was, with no new entry. */
async function expectStill(page: Page, path: string, before: number) {
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(`${BASE}${path}`)
  expect(await page.evaluate(() => history.length)).toBe(before)
}

const still = ['root', 'pinned-bottom', 'toast-region', 'scan-book']

/** The keyframes and direction each snapshot of the moving boundary runs, per type. */
const slides = {
  'section-next': { old: ['slide-to-left', 'normal'], new: ['slide-from-right', 'normal'] },
  'section-prev': { old: ['slide-from-right', 'reverse'], new: ['slide-to-left', 'reverse'] },
} as const

/** The transition of `type` slid one boundary's old and new snapshots, for 200 ms, its way. */
async function expectSlide(page: Page, type: keyof typeof slides) {
  const record = await transitionOfType(page, type)
  for (const kind of ['old', 'new'] as const) {
    const moving = record.animations
      .filter(
        (a) =>
          a.pseudo.startsWith(`::view-transition-${kind}(`) &&
          !still.some((name) => a.pseudo === `::view-transition-${kind}(${name})`),
      )
      .map(({ name, direction, duration }) => [name, direction, duration])
    expect(moving, `${type} ${kind}`).toEqual([[...slides[type][kind], 200]])
  }
  return record
}

/** `name` had snapshots of its own (their group exists), on which nothing ran. */
function expectStillSnapshots(record: Recorded, name: string) {
  const pseudos = record.animations.map((a) => a.pseudo)
  expect(pseudos).toContain(`::view-transition-group(${name})`)
  expect(pseudos).not.toContain(`::view-transition-old(${name})`)
  expect(pseudos).not.toContain(`::view-transition-new(${name})`)
}

test.describe('Swiping between sections', () => {
  test.beforeAll(async () => {
    await seedTestUser(user)
  })

  test.afterAll(async () => {
    await cleanupTestUser(user)
  })

  test('a swipe left opens the next section with a slide', async ({ page }) => {
    await page.addInitScript(probeViewTransitions)
    await signIn(page)
    await open(page, '/loans', 'Loans')

    await left(page)

    await expectSection(page, '/wishlists', 'Wishlists')
    await expectSlide(page, 'section-next')
  })

  test('swipes wrap round both ways, and Back returns to the previous section', async ({
    page,
  }) => {
    await page.addInitScript(probeViewTransitions)
    await signIn(page)
    await open(page, '/', 'Collection')

    await right(page)
    await expectSection(page, '/settings', 'Settings')
    await expectSlide(page, 'section-prev')

    await left(page)
    await expectSection(page, '/', 'Collection')

    await page.goBack()
    await expectSection(page, '/settings', 'Settings')
  })

  test('swipes from an edge, mostly downwards or with a second finger change nothing', async ({
    page,
  }) => {
    await signIn(page)
    await open(page, '/loans', 'Loans')
    const before = await page.evaluate(() => history.length)

    await swipe(page, { x: 10, y: middle }, { x: 300, y: middle })
    await expectStill(page, '/loans', before)

    await swipe(page, { x: PHONE.width - 10, y: middle }, { x: 100, y: middle })
    await expectStill(page, '/loans', before)

    await swipe(page, { x: 250, y: 200 }, { x: 150, y: 600 })
    await expectStill(page, '/loans', before)

    const cdp = await page.context().newCDPSession(page)
    const first = { x: 300, y: middle }
    const second = { x: 200, y: middle + 100 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [first, second],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 100, y: middle }, second],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    await expectStill(page, '/loans', before)

    // The listener is on: the same swipe away from the edge goes through.
    await left(page)
    await expectSection(page, '/wishlists', 'Wishlists')
  })

  test('a swipe starting on a text field changes nothing', async ({ page }) => {
    await signIn(page)
    await open(page, '/settings', 'Settings')
    const before = await page.evaluate(() => history.length)
    const box = await page.getByLabel('Display name').boundingBox()
    if (!box) throw new Error('Display name field not found')
    const y = box.y + box.height / 2
    const from = box.x + box.width * 0.8

    await swipe(page, { x: from, y }, { x: from - 200, y })

    await expectStill(page, '/settings', before)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  })

  test('on a wide screen a swipe changes nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signIn(page)
    await open(page, '/loans', 'Loans')
    const before = await page.evaluate(() => history.length)

    await swipe(page, { x: 900, y: 400 }, { x: 500, y: 400 })
    await expectStill(page, '/loans', before)
  })

  test('under reduce motion a swipe changes section at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(probeViewTransitions)
    await signIn(page)
    await open(page, '/loans', 'Loans')

    await left(page)

    await expectSection(page, '/wishlists', 'Wishlists')
    await transitionOfType(page, 'section-next')
    expect(await longAnimations(page)).toEqual([])
  })

  test('a heading tap slides forward, under a still Scan book bar and toast region', async ({
    page,
  }) => {
    await page.addInitScript(probeViewTransitions)
    await signIn(page)
    await open(page, '/', 'Collection')

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Loans' })
      .tap()

    await expectSection(page, '/loans', 'Loans')
    const record = await expectSlide(page, 'section-next')
    expectStillSnapshots(record, 'pinned-bottom')
    expectStillSnapshots(record, 'toast-region')
  })

  test('on a wide screen a heading click slides forward, Scan book still', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript(probeViewTransitions)
    await signIn(page)
    await open(page, '/', 'Collection')

    await page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Loans' })
      .click()

    await expectSection(page, '/loans', 'Loans')
    const record = await expectSlide(page, 'section-next')
    expectStillSnapshots(record, 'scan-book')
  })
})
