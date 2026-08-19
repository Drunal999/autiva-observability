import { test, expect } from '@playwright/test'

// Requires: E2E_TEST_MODE=true, and a User row seeded with githubId
// "e2e-test-user" (e.g. via `npx prisma db seed`, added if not already
// present — see Task 3's schema). This bypasses real GitHub OAuth.
test('sign in, create a task, assign it, and complete it', async ({ page }) => {
  await page.goto('/api/auth/signin')
  await page.getByLabel('githubId').fill('e2e-test-user')
  await page.getByRole('button', { name: /sign in with e2e test login/i }).click()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Team Board' })).toBeVisible()

  await page.getByRole('button', { name: 'New Task' }).click()
  await page.getByLabel('Title').fill('E2E smoke task')
  await page.getByRole('button', { name: 'Save' }).click()

  const card = page.getByText('E2E smoke task')
  await expect(card).toBeVisible()

  const doneColumn = page.getByTestId('column-DONE')
  await card.dragTo(doneColumn)

  await expect(page.getByTestId('completion-animation')).toBeVisible()
})
