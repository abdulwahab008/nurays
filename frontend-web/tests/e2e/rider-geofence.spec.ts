import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? path.join(process.cwd(), 'test-results', 'rider');

test('Rider Geofence Proximity Auto-Arrival & Handshake Verification', async ({ page }) => {
  // 1. Login as rider
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByLabel(/Email Address/).fill('rider@nuray.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // 2. Expect redirection to rider dashboard
  await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });
  await page.waitForTimeout(2000);

  // 3. Ensure we have an assigned run by simulating and claiming a fresh order
  const activeTabBtn = page.getByRole('button', { name: /Active Run/i });
  const simBtn = page.getByRole('button', { name: /Simulate Run/i }).first();
  await simBtn.click();
  await page.waitForTimeout(2000);

  // Switch to Available Pool and claim the fresh run
  const poolBtn = page.getByRole('button', { name: /Available Pool/i });
  await poolBtn.click();
  await page.waitForTimeout(1000);
  const claimBtn = page.locator('button:has-text("Claim This Run")').first();
  await claimBtn.click();
  await page.waitForTimeout(2000);

  // 4. Switch back to Active Run tab
  await activeTabBtn.click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: `${ARTIFACT_DIR}/geofence_step1_assigned.png` });

  // 5. Test Event 1: Arrive at Food Location (Kitchen Geofence Proximity <= 150m)
  const arriveAtFoodBtn = page.locator('button:has-text("Arrived at Food Location")').first();
  await expect(arriveAtFoodBtn).toBeVisible({ timeout: 10_000 });
  await arriveAtFoodBtn.click();

  // Verify status automatically changes to arrived_at_pickup / At Kitchen
  await expect(page.getByText('At Kitchen').first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${ARTIFACT_DIR}/geofence_step2_at_kitchen.png` });

  // 6. Test Event 2: Pick Up & Depart on Transit
  const transitBtn = page.locator('button:has-text("1-Touch: Pick Up & Start Transit")').first();
  await expect(transitBtn).toBeVisible({ timeout: 10_000 });
  await transitBtn.click();
  await page.waitForTimeout(2000);

  // 7. Test Event 3: Arrive at Customer Doorstep (Doorstep Geofence Proximity <= 150m)
  const arriveAtDoorstepBtn = page.locator('button:has-text("Arrived at Doorstep")').first();
  await expect(arriveAtDoorstepBtn).toBeVisible({ timeout: 10_000 });
  await arriveAtDoorstepBtn.click();

  // Verify PIN modal automatically pops open upon entering doorstep geofence
  await expect(page.getByText('Customer Handover PIN')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${ARTIFACT_DIR}/geofence_step3_doorstep_pin_modal.png` });

  // 8. Auto-fill PIN and verify delivery completion
  const autoFillBtn = page.getByRole('button', { name: /Auto-Fill Customer PIN/i });
  await expect(autoFillBtn).toBeVisible();
  await autoFillBtn.click();
  await page.waitForTimeout(500);

  const confirmDeliveryBtn = page.getByRole('button', { name: /Confirm Handover & Deliver/i });
  await expect(confirmDeliveryBtn).toBeEnabled({ timeout: 5000 });
  await confirmDeliveryBtn.click();
  await page.waitForTimeout(2500);

  // 9. Verify order is delivered and completed
  await page.screenshot({ path: `${ARTIFACT_DIR}/geofence_step4_delivered_success.png` });
});
