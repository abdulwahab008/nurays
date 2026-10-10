import { test, expect } from '@playwright/test';
import { appLinkEnv, appLinksConfigured, appSiteAssociation, assetLinks } from '../../lib/app-links';
import { isNativeShell, openExternal, reserveExternal, type ExternalWindow } from '../../lib/open-external';

/**
 * What the app stores and their reviewers can reach without signing in: a help page with a FAQ and the support
 * e-mail (MOBILE-6), and the two files that tie the website to the store apps (MOBILE-7).
 */

const FINGERPRINT = '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5';

test.describe('the help page', () => {
  test('is public, answers questions and says how to reach support', async ({ page }) => {
    await page.goto('/help');
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Help & contact' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Talk to us' })).toBeVisible();
    // The support address is shown (the configured one, or the visible placeholder while none is set).
    await expect(page.getByText('Email:')).toBeVisible();
    // Not a legal text: no "must be reviewed by a lawyer" notice.
    await expect(page.getByText(/must be reviewed by a qualified lawyer/)).toHaveCount(0);
  });

  test('a question opens to its answer', async ({ page }) => {
    await page.goto('/help');
    const answer = page.getByText('Give it to whoever hands you the order');
    await expect(answer).toBeHidden();
    await page.getByText('What is the 4-digit code on my order?').click();
    await expect(answer).toBeVisible();
  });

  test('links to the pages a visitor needs, all of which load without signing in', async ({ page, request }) => {
    await page.goto('/help');
    for (const href of ['/refund-policy', '/privacy', '/delete-account', '/forgot-password', '/sellers/register', '/register?user_type=rider']) {
      await expect(page.locator(`a[href="${href}"]`).first(), `a link to ${href}`).toBeAttached();
      const res = await request.get(href);
      expect(res.status(), `${href} loads`).toBe(200);
    }
  });

  test('is where the footer and the legal pages send "Help"', async ({ page }) => {
    await page.goto('/terms');
    await page.getByRole('link', { name: 'Help & contact' }).click();
    await expect(page).toHaveURL(/\/help$/);
  });
});

test.describe('the files that tie the website to the store apps', () => {
  const full = {
    ANDROID_APP_PACKAGE: 'pk.nuray.app',
    ANDROID_SHA256_CERT_FINGERPRINTS: `${FINGERPRINT}, ${FINGERPRINT.toLowerCase().replace(/^14/, 'aa')}`,
    IOS_APP_IDS: 'ABCDE12345.pk.nuray.app',
  };

  test('Android: nothing is served until the package and a certificate fingerprint are both set', () => {
    expect(assetLinks({})).toBeNull();
    expect(assetLinks({ ANDROID_APP_PACKAGE: 'pk.nuray.app' })).toBeNull();
    expect(assetLinks({ ANDROID_SHA256_CERT_FINGERPRINTS: FINGERPRINT })).toBeNull();
    expect(assetLinks({ ANDROID_APP_PACKAGE: 'pk.nuray.app', ANDROID_SHA256_CERT_FINGERPRINTS: '   ' })).toBeNull();
  });

  test('Android: a mistyped package or fingerprint is not served', () => {
    expect(assetLinks({ ANDROID_APP_PACKAGE: 'nuray', ANDROID_SHA256_CERT_FINGERPRINTS: FINGERPRINT })).toBeNull();
    expect(assetLinks({ ANDROID_APP_PACKAGE: 'pk.nuray app', ANDROID_SHA256_CERT_FINGERPRINTS: FINGERPRINT })).toBeNull();
    expect(assetLinks({ ANDROID_APP_PACKAGE: 'pk.nuray.app', ANDROID_SHA256_CERT_FINGERPRINTS: 'AA:BB' })).toBeNull();
    expect(assetLinks({ ANDROID_APP_PACKAGE: 'pk.nuray.app', ANDROID_SHA256_CERT_FINGERPRINTS: FINGERPRINT.slice(0, -3) })).toBeNull();
  });

  test('Android: the file lets the app handle the site\'s links, with every valid fingerprint upper-cased', () => {
    const lowered = FINGERPRINT.replace(/^14/, 'aa').toLowerCase();
    const links = assetLinks({ ANDROID_APP_PACKAGE: ' pk.nuray.app ', ANDROID_SHA256_CERT_FINGERPRINTS: `${FINGERPRINT}, nonsense, ${lowered}` });
    expect(links).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'pk.nuray.app', sha256_cert_fingerprints: [FINGERPRINT, lowered.toUpperCase()] },
      },
    ]);
  });

  test('iOS: nothing is served without a valid app id, and the API and admin console never open the app', () => {
    expect(appSiteAssociation({})).toBeNull();
    expect(appSiteAssociation({ IOS_APP_IDS: 'pk.nuray.app' })).toBeNull(); // no team id
    expect(appSiteAssociation({ IOS_APP_IDS: 'ABCDE12345.pk.nuray.app, bad id' })).toEqual({
      applinks: {
        details: [{ appIDs: ['ABCDE12345.pk.nuray.app'], components: [{ '/': '/api/*', exclude: true }, { '/': '/admin/*', exclude: true }, { '/': '*' }] }],
      },
    });
  });

  test('a half-filled setting is told apart from "not configured"', () => {
    expect(appLinksConfigured({})).toEqual({ android: false, ios: false });
    expect(appLinksConfigured({ ANDROID_APP_PACKAGE: 'x' })).toEqual({ android: true, ios: false });
    expect(appLinksConfigured({ IOS_APP_IDS: 'x' })).toEqual({ android: false, ios: true });
  });

  // The server these run against has the settings of the CI job (or none, on a developer's machine: then they are skipped).
  test('the running site serves both files from its environment', async ({ request }) => {
    const env = appLinkEnv();
    test.skip(!assetLinks(env) && !appSiteAssociation(env), 'the site under test has no app settings');
    if (assetLinks(env)) {
      const res = await request.get('/.well-known/assetlinks.json');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/json');
      expect(await res.json()).toEqual(assetLinks(env));
    }
    if (appSiteAssociation(env)) {
      const res = await request.get('/.well-known/apple-app-site-association');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/json');
      expect(await res.json()).toEqual(appSiteAssociation(env));
    }
  });

  test('the running site serves nothing for an app it has no settings for', async ({ request }) => {
    const env = appLinkEnv();
    if (!assetLinks(env)) expect((await request.get('/.well-known/assetlinks.json')).status()).toBe(404);
    if (!appSiteAssociation(env)) expect((await request.get('/.well-known/apple-app-site-association')).status()).toBe(404);
  });

  test('the sample settings used above are valid ones', () => {
    expect(assetLinks(full)).not.toBeNull();
    expect(appSiteAssociation(full)).not.toBeNull();
  });
});

test.describe('opening something outside the app', () => {
  /** A stand-in window that records what was asked of it. */
  function fakeWindow(opts: { native?: boolean; popupBlocked?: boolean; plugins?: ExternalWindow['Capacitor'] extends infer C ? (C extends { Plugins?: infer P } ? P : never) : never } = {}) {
    const calls: Array<[string, ...unknown[]]> = [];
    const tab = { closed: false, opener: 'the page' as unknown, location: { href: '' }, close() { this.closed = true; calls.push(['tab.close']); } };
    const win: ExternalWindow = {
      open: (...args) => { calls.push(['open', ...args]); return opts.popupBlocked ? null : tab; },
      location: { assign: (url) => calls.push(['assign', url]), origin: 'https://nuray.pk' },
      ...(opts.native ? { Capacitor: { isNativePlatform: () => true, Plugins: opts.plugins } } : {}),
    };
    return { win, calls, tab };
  }

  test('on the web a link opens in a new tab that cannot reach back to the page', () => {
    const { win, calls } = fakeWindow();
    expect(isNativeShell(win)).toBe(false);
    openExternal('https://www.google.com/maps/dir/?api=1&destination=24.9,67.1', win);
    expect(calls).toEqual([['open', 'https://www.google.com/maps/dir/?api=1&destination=24.9,67.1', '_blank', 'noopener,noreferrer']]);
  });

  test('a link only known later: a tab is opened at once, sent to the link when it is known, and cut off from the page', () => {
    const { win, calls, tab } = fakeWindow();
    const reserved = reserveExternal(win);
    expect(calls).toEqual([['open', '', '_blank']]); // inside the tap, before anything is awaited
    expect(tab.opener).toBeNull();
    reserved.open('https://maps.example/route');
    expect(tab.location.href).toBe('https://maps.example/route');
    expect(calls.some(([name]) => name === 'assign')).toBe(false);
  });

  test('a reserved tab is closed when the link is not needed after all, and a closed one is not used', () => {
    const first = fakeWindow();
    reserveExternal(first.win).cancel();
    expect(first.tab.closed).toBe(true);

    const second = fakeWindow();
    const reserved = reserveExternal(second.win);
    second.tab.closed = true; // the rider closed it meanwhile
    reserved.open('https://maps.example/route');
    expect(second.calls).toContainEqual(['assign', 'https://maps.example/route']);
  });

  test('a blocked pop-up sends the app itself to the link, and cancelling it does nothing', () => {
    const { win, calls } = fakeWindow({ popupBlocked: true });
    const reserved = reserveExternal(win);
    reserved.open('https://maps.example/route');
    expect(calls).toContainEqual(['assign', 'https://maps.example/route']);
    expect(() => reserved.cancel()).not.toThrow();
  });

  test('in the native shell web pages go to its browser and other schemes to the launcher, with full addresses', () => {
    const opened: string[] = [];
    const plugins = {
      Browser: { open: async ({ url }: { url: string }) => void opened.push(`browser ${url}`) },
      AppLauncher: { openUrl: async ({ url }: { url: string }) => void opened.push(`launcher ${url}`) },
    };
    const { win, calls } = fakeWindow({ native: true, plugins });
    expect(isNativeShell(win)).toBe(true);
    openExternal('https://www.google.com/maps/dir/?api=1&destination=24.9,67.1', win);
    openExternal('geo:24.9,67.1?q=24.9,67.1(Door)', win);
    openExternal('/refund-policy', win);
    expect(opened).toEqual([
      'browser https://www.google.com/maps/dir/?api=1&destination=24.9,67.1',
      'launcher geo:24.9,67.1?q=24.9,67.1(Door)',
      'browser https://nuray.pk/refund-policy',
    ]);
    expect(calls).toEqual([]); // no new tab in the shell
    // a link only known later needs no reserved tab there
    const reserved = reserveExternal(win);
    reserved.open('https://maps.example/route');
    expect(calls).toEqual([]);
    expect(opened.at(-1)).toBe('browser https://maps.example/route');
  });

  test('without a plugin the shell falls back to a plain new window rather than doing nothing', () => {
    const { win, calls } = fakeWindow({ native: true, plugins: {} });
    openExternal('https://www.google.com/maps', win);
    expect(calls).toEqual([['open', 'https://www.google.com/maps', '_blank', 'noopener,noreferrer']]);
  });

  test('outside a browser (no window) nothing happens and nothing throws', () => {
    expect(() => openExternal('https://x.example', undefined)).not.toThrow();
  });
});
