import { test, expect, type Page } from '@playwright/test';
import { newCustomer, signIn, type Customer } from './support/customer';

// A page whose data cannot be read must say so. These pages used to show an empty list or made-up numbers when the API failed ("Your tray is
// empty", "0 orders", a profile of "Not provided" that Edit then saved), which tells a customer that what is theirs is gone. Each now shows
// a message that says it could not load and a Try again button (the shared "We couldn't load this" block, or the page's own wording). The API itself is untouched: the browser is made to see the failure.

const PAGES: Array<[path: string, name: string]> = [
  ['/cart', 'the tray'],
  ['/orders', 'my orders'],
  ['/profile', 'my profile'],
  ['/profile/addresses', 'my saved addresses'],
  ['/wallet', 'my wallet'],
  ['/notifications', 'my notifications'],
  ['/favorites', 'my favourite kitchens'],
];

const FAILURES: Array<[name: string, answer: Parameters<Page['route']>[1]]> = [
  ['the API answers 500', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }) })],
  ['the API cannot be reached', (route) => route.abort('connectionrefused')],
  ['a proxy answers with its own web page', (route) => route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body><h1>502 Bad Gateway</h1></body></html>' })],
];

test.describe('Customer pages when the API fails', () => {
  let customer: Customer;
  test.beforeAll(async () => {
    customer = await newCustomer();
  });

  for (const [failure, answer] of FAILURES) {
    test(`each page says it could not load, with Try again, when ${failure}`, async ({ page }) => {
      await signIn(page, customer);
      // Only the API's own requests: the app's pages and files load as usual.
      await page.route('**/api/v1/**', answer);
      for (const [path, name] of PAGES) {
        await page.goto(path);
        // A way to ask again, and words that say what happened (the shared block says "We couldn't load this"; a few pages word it themselves).
        await expect(page.getByRole('button', { name: /^(try again|retry)$/i }).first(), `${name} (${path}) offers Try again`).toBeVisible({ timeout: 20000 });
        await expect(page.locator('main, body').first(), `${name} (${path}) says it could not load`).toContainText(/couldn.t load|could not (load|reach)|failed to load|went wrong|too many|check your (internet )?connection/i);
      }
    });
  }

  test('Try again loads the page once the API answers', async ({ page }) => {
    await signIn(page, customer);
    let failing = true;
    await page.route('**/api/v1/**', (route) => (failing ? route.abort('connectionrefused') : route.continue()));
    await page.goto('/orders');
    const retry = page.getByRole('button', { name: /^(try again|retry)$/i }).first();
    await expect(retry).toBeVisible({ timeout: 20000 });
    failing = false;
    await retry.click();
    await expect(retry).toBeHidden({ timeout: 20000 });
  });
});
