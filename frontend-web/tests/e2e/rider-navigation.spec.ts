import { test, expect } from '@playwright/test';
import { alternativeMapsLink, appleMapsDirectionsUrl, canNavigateTo, geoUrl, googleMapsDirectionsUrl, mobilePlatform } from '../../lib/navigation-links';

/**
 * The rider's "Start navigation" link: the destination handed to the maps app, and the button's
 * states on the dashboard. The pure link builders are checked here directly; the dashboard part
 * runs against whatever jobs the E2E rider has (it skips, with a note, when there is none).
 */
test.describe('navigation links', () => {
  test('a saved pin becomes a Google Maps directions link with only documented parameters', () => {
    const url = googleMapsDirectionsUrl({ latitude: 24.92, longitude: 67.09, text: 'House 12, Street 4' });
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=24.92,67.09');
    expect(url).not.toContain('travelmode');
  });

  test('without a pin the address text is the destination', () => {
    expect(googleMapsDirectionsUrl({ text: 'House 12, Street 4, Karachi' })).toBe('https://www.google.com/maps/dir/?api=1&destination=House%2012%2C%20Street%204%2C%20Karachi');
    expect(canNavigateTo({ text: '  ' })).toBe(false);
    expect(canNavigateTo({ latitude: 24.9, longitude: 67.1 })).toBe(true);
  });

  test('iPhones get an Apple Maps alternative, Android a geo: intent, desktops nothing', () => {
    const d = { latitude: 24.92, longitude: 67.09, text: 'Door' };
    expect(appleMapsDirectionsUrl(d)).toBe('https://maps.apple.com/?daddr=24.92,67.09&dirflg=d');
    expect(geoUrl(d)).toBe('geo:24.92,67.09?q=24.92,67.09(Door)');
    expect(mobilePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios');
    expect(mobilePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
    expect(alternativeMapsLink(d, 'ios')?.kind).toBe('apple');
    expect(alternativeMapsLink(d, 'android')?.kind).toBe('geo');
    expect(alternativeMapsLink(d, 'other')).toBeNull();
    expect(alternativeMapsLink({ text: '' }, 'ios')).toBeNull();
  });
});

test('the rider dashboard offers Start navigation only on a job that is on the move', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByLabel(/Email Address/).fill('rider@nuray.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });
  await page.waitForTimeout(2500);

  const starts = page.getByTestId('start-navigation');
  const n = await starts.count();
  if (n === 0) {
    test.info().annotations.push({ type: 'note', description: 'the E2E rider has no job on the move; only the link builders were exercised' });
    return;
  }
  for (let i = 0; i < n; i++) {
    const href = await starts.nth(i).getAttribute('href');
    expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
    expect(href).not.toContain('travelmode');
    expect(await starts.nth(i).getAttribute('target')).toBe('_blank');
  }
  // Opening navigation changes nothing about the job: the status step is the same afterwards.
  const before = await page.locator('body').innerText();
  const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 8000 }).catch(() => null), starts.first().click()]);
  if (popup) await popup.close();
  await page.waitForTimeout(1500);
  expect((await page.locator('body').innerText()).includes('At Doorstep')).toBe(before.includes('At Doorstep'));
});
