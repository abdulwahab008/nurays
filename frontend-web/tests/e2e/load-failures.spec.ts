import { test, expect, type Page } from '@playwright/test';
import { newCustomer, signIn, type Customer } from './support/customer';

// A page whose data cannot be read must say so. These pages used to show an empty list or made-up numbers when the API failed ("Your tray
// is empty", "0 orders", a profile of "Not provided" that Edit then saved), which tells a customer that what is theirs is gone. Each now shows
// a message that says it could not load and a Try again button (the shared "We couldn't load this" block, or the page's own wording), and
// nothing else on the page says anything about the data it could not read. The API itself is untouched: the browser is made to see the failure.

const PAGES: Array<[path: string, name: string]> = [
  ['/dashboard', 'the dashboard'],
  ['/cart', 'the tray'],
  ['/orders', 'my orders'],
  ['/profile', 'my profile'],
  ['/profile/addresses', 'my saved addresses'],
  ['/wallet', 'my wallet'],
  ['/notifications', 'my notifications'],
  ['/favorites', 'my favourite kitchens'],
];

// What these pages used to say next to (or instead of) the error: a subtitle, a counter or an empty-state about data that was never read.
const SAID_ABOUT_UNREAD_DATA =
  /currently empty|tray is empty|no orders placed yet|\bnot provided\b|\bnot set\b|no notifications yet|\b0 unread\b|all caught up|no dishes are listed yet|no saved addresses|no favou?rite|(^|\n)\s*(0|none)\s*(\n|$)/i;

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
        // ... and says nothing else about what it could not read (the tray is not "currently empty", there are not "0 unread notifications").
        const said = (await page.locator('main').first().innerText()).match(SAID_ABOUT_UNREAD_DATA);
        expect.soft(said && said[0].trim(), `${name} (${path}) must not describe data it could not read`).toBeNull();
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

// The kitchen's own pages. Two of them are forms of the kitchen's real settings: shown with blanks and defaults when the settings could not
// be read, a Save would have replaced the real ones, so there is no form until they were read. The others used to print "Rs 0", "0 sold",
// "100% Excellent", "Zero stockouts" and "No notifications" next to the error.
const KITCHEN_PAGES: Array<[path: string, name: string]> = [
  ['/sellers/settings', 'the kitchen settings'],
  ['/sellers/delivery', 'the delivery settings'],
  ['/sellers/products', 'my dishes'],
  ['/sellers/promotions', 'my promotions'],
  ['/sellers/analytics', 'my analytics'],
  ['/sellers/notifications', 'my kitchen notifications'],
];
const SAID_ABOUT_UNREAD_KITCHEN_DATA =
  /zero stockouts|ready for fast dispatch|no products in kitchen yet|100%|excellent|no sales recorded|no food sales|\b0 sold\b|\b0 units\b|0 unread|no notifications|no communities are available|(^|\n)\s*(0|none|rs\.? ?0)\s*(\n|$)/i;

test.describe('Kitchen pages when the API fails', () => {
  let customer: Customer;
  test.beforeAll(async () => {
    customer = await newCustomer();
  });

  for (const [failure, answer] of FAILURES) {
    test(`no form of made-up values and no counters when ${failure}`, async ({ page }) => {
      // Nothing the pages ask the API is answered, so any signed-in kitchen will do: the session is a customer's with a kitchen's role.
      await signIn(page, { jwt: customer.jwt, user: { ...(customer.user as object), userType: 'seller', user_type: 'seller' } });
      await page.route('**/api/v1/**', answer);
      for (const [path, name] of KITCHEN_PAGES) {
        await page.goto(path);
        await expect(page.getByRole('button', { name: /^(try again|retry)/i }).first(), `${name} (${path}) offers Try again`).toBeVisible({ timeout: 20000 });
        const main = page.locator('main').first();
        await expect(main, `${name} (${path}) says it could not load`).toContainText(/couldn.t load|could not (load|reach)|failed to load|went wrong|too many|check your (internet )?connection/i);
        // No box to type in, so nothing can be saved over what the kitchen really has.
        const boxes = await main.locator('input:not([type=hidden]), textarea, select').count();
        expect.soft(boxes, `${name} (${path}) must not offer a form it could not fill in`).toBe(0);
        const said = (await main.innerText()).match(SAID_ABOUT_UNREAD_KITCHEN_DATA);
        expect.soft(said && said[0].trim(), `${name} (${path}) must not describe data it could not read`).toBeNull();
      }
    });
  }
});
