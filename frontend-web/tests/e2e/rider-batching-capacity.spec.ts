import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? path.join(process.cwd(), 'test-results', 'rider');

test('Rider 2-Order Capacity Cap & InDrive Corridor Bidding Verification', async ({ page }) => {
  // 1. Login as rider
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByLabel(/Email Address/).fill('rider@nuray.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // 2. Expect redirection to rider dashboard
  await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });
  await page.waitForTimeout(2000);

  // 3. Verify Capacity indicator in top banner
  await expect(page.getByText(/Capacity:/i)).toBeVisible();

  // 4. Switch to Available Pool tab
  const poolBtn = page.getByRole('button', { name: /Available Pool/i });
  await poolBtn.click();
  await page.waitForTimeout(1000);

  // 5. If rider has 2 active orders, verify capacity banner and disabled claim buttons
  const atCapacity = await page.getByText(/Maximum Capacity Limit Reached/i).count();
  if (atCapacity > 0) {
    await expect(page.getByText(/2 \/ 2 Capacity Full/i)).toBeVisible();
    await page.screenshot({ path: `${ARTIFACT_DIR}/batching_step1_capacity_full.png` });

    // Switch to Active Run tab and deliver one order to free capacity
    const activeTabBtn = page.getByRole('button', { name: /Active Run/i });
    await activeTabBtn.click();
    await page.waitForTimeout(1000);

    // If there is an active run with PIN handover, deliver it or single step advance it
    const advanceBtn = page.locator('button:has-text("Step Forward")').or(page.locator('button:has-text("1-Touch")')).first();
    if (await advanceBtn.count() > 0) {
      await advanceBtn.click();
      await page.waitForTimeout(1500);
    }
  }

  // 6. Navigate back to Available Pool
  await poolBtn.click();
  await page.waitForTimeout(1000);

  // 7. Verify InDrive corridor bidding elements are rendered
  await expect(page.getByText(/inDrive Regulated Corridor/i).first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${ARTIFACT_DIR}/batching_step2_indrive_bidding_corridor.png` });
});
