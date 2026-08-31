import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

/**
 * The status cluster must stay on screen at every width.
 *
 * The alert badge was added to a header whose nav was `shrink-0`, so the nav
 * took its full content width and pushed everything after it past the right
 * edge — 122px of header, including both badges, the roster and the clock,
 * off-screen at 1280px. Nothing failed; the header simply ended early. An
 * alert nobody can see is not an alert.
 *
 * THE BADGES MUST BE PRESENT FOR THIS TO MEAN ANYTHING. They arrive with a
 * fetch rather than at first paint, and the first version of this test
 * measured before that landed — a header with no badges in it, which of
 * course fitted. It is seeded and awaited here for that reason.
 */

const prisma = new PrismaClient()

test.beforeAll(async () => {
  const user = await prisma.user.findFirst({ where: { handle: 'e2e-test-user' } })
  const tenant = await prisma.tenant.findFirst()
  if (!user || !tenant) throw new Error('seed the e2e user and a tenant first')
  await prisma.notification.deleteMany({ where: { userId: user.id, subjectId: { startsWith: 'header-fits' } } })
  await prisma.notification.createMany({
    data: (['MENTION', 'RUN_FAILED'] as const).map((kind) => ({
      tenantId: tenant.id,
      userId: user.id,
      kind,
      subjectType: 'AGENT' as const,
      subjectId: `header-fits-${kind}`,
      preview: `${kind} fixture`,
    })),
  })
})

test.afterAll(async () => {
  await prisma.notification.deleteMany({ where: { subjectId: { startsWith: 'header-fits' } } })
  await prisma.$disconnect()
})

async function signInAndWaitForBadges(page: Page) {
  await page.goto('/api/auth/signin')
  await page.getByLabel('githubId').fill('e2e-test-user')
  await page.getByRole('button', { name: /sign in with e2e test login/i }).click()
  await page.goto('/board')
  await expect(page.getByRole('button', { name: /alerts, click to clear/i })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('button', { name: /unread mentions/i })).toBeVisible({ timeout: 20000 })
}

const nav = (page: Page) => page.locator('header nav').first()
const isFaded = (page: Page) =>
  nav(page).evaluate((el) => getComputedStyle(el).maskImage !== 'none')

for (const width of [1280, 1440, 1920]) {
  test(`the whole status cluster is on screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await signInAndWaitForBadges(page)

    const header = await page.locator('header').first().evaluate((el) => ({
      overflow: el.scrollWidth - el.clientWidth,
      rightmost: Math.max(
        ...Array.from(el.children).map((k) => k.getBoundingClientRect().right)
      ),
    }))
    expect(header.overflow, 'header content overflows its own width').toBeLessThanOrEqual(1)
    expect(
      header.rightmost,
      'a header item runs off the right edge — the nav is probably shrink-0 again'
    ).toBeLessThanOrEqual(width)

    // The fade is the only sign that the nav holds more than it shows, so it
    // has to track reality rather than being decoration.
    const cut = await nav(page).evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(
      await isFaded(page),
      cut > 4 ? 'nav is cut off but shows no fade' : 'nav fits but is faded anyway'
    ).toBe(cut > 4)
  })
}

test('the nav fade clears once there is nothing left to reveal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await signInAndWaitForBadges(page)
  expect(await isFaded(page)).toBe(true)

  await nav(page).evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await expect.poll(() => isFaded(page)).toBe(false)
})

test('an alert and a mention are counted apart', async ({ page }) => {
  // One badge for both would say "2 unread mentions" when one of them is a
  // failed run, and the wording is how somebody decides whether to look.
  await signInAndWaitForBadges(page)
  await expect(page.getByRole('button', { name: /alerts, click to clear/i }))
    .toHaveAttribute('title', /needs? attention/)
  await expect(page.getByRole('button', { name: /unread mentions/i }))
    .toHaveAttribute('title', /unread mention/)
})
