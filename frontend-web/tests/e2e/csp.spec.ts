import { test, expect } from '@playwright/test';
import { sanitizeReports, stripAddress } from '../../lib/csp-report';

/**
 * The Content-Security-Policy is sent report-only first. These checks keep that useful: the policy
 * names the collector, the collector takes both report formats and logs no secret, and the public pages
 * load without a single violation, which is the evidence needed before the policy is enforced.
 */

test.describe('CSP report collector', () => {
  test('the policy sends its reports to /api/csp-report', async ({ request }) => {
    const res = await request.get('/');
    const policy = res.headers()['content-security-policy-report-only'] ?? res.headers()['content-security-policy'];
    expect(policy).toBeTruthy();
    expect(policy).toContain('report-uri /api/csp-report');
    expect(policy).toContain("frame-ancestors 'none'");
  });

  test('it answers 204 to the legacy format, the Reporting API format, and to anything else', async ({ request }) => {
    const legacy = await request.post('/api/csp-report', {
      headers: { 'content-type': 'application/csp-report' },
      data: JSON.stringify({ 'csp-report': { 'document-uri': 'https://nuray.test/reset-password?token=SECRET', 'violated-directive': 'script-src-elem', 'blocked-uri': 'https://evil.test/x.js?k=SECRET' } }),
    });
    expect(legacy.status()).toBe(204);
    const modern = await request.post('/api/csp-report', {
      headers: { 'content-type': 'application/reports+json' },
      data: JSON.stringify([{ type: 'csp-violation', body: { documentURL: 'https://nuray.test/a?b=c', effectiveDirective: 'img-src', blockedURL: 'inline' } }]),
    });
    expect(modern.status()).toBe(204);
    for (const data of ['not json at all', '[]', '{"csp-report":42}', 'x'.repeat(40_000)]) {
      expect((await request.post('/api/csp-report', { headers: { 'content-type': 'application/json' }, data })).status()).toBe(204);
    }
    expect((await request.get('/api/csp-report')).status()).toBe(405);
  });

  test('a report keeps the origin and path of an address and drops what could hold a secret', () => {
    const [legacy] = sanitizeReports({
      'csp-report': {
        'document-uri': 'https://nuray.test/reset-password?token=SECRET#frag',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.test/x.js?k=SECRET',
        'source-file': 'https://nuray.test/_next/static/chunks/a.js?v=SECRET',
        'line-number': 12,
        'script-sample': 'const password = "SECRET"',
        disposition: 'report',
      },
    });
    expect(legacy).toEqual({
      directive: 'script-src-elem',
      blocked: 'https://evil.test/x.js',
      page: 'https://nuray.test/reset-password',
      source: 'https://nuray.test/_next/static/chunks/a.js',
      line: 12,
      disposition: 'report',
    });
    expect(JSON.stringify(legacy)).not.toContain('SECRET');

    const [modern] = sanitizeReports([{ type: 'csp-violation', body: { documentURL: 'https://nuray.test/a?b=SECRET', effectiveDirective: 'img-src', blockedURL: 'inline', lineNumber: 3, disposition: 'enforce' } }]);
    expect(modern).toEqual({ directive: 'img-src', blocked: 'inline', page: 'https://nuray.test/a', source: '', line: 3, disposition: 'enforce' });
  });

  test('it ignores what is not a violation report and caps what it keeps', () => {
    expect(sanitizeReports(null)).toEqual([]);
    expect(sanitizeReports('x')).toEqual([]);
    expect(sanitizeReports([{ type: 'deprecation', body: { id: 'x' } }, 7, null])).toEqual([]);
    expect(sanitizeReports(Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: { documentURL: 'https://a.test/' } })))).toHaveLength(10);
    expect(stripAddress('x'.repeat(1000))).toHaveLength(200);
    expect(stripAddress('data')).toBe('data');
    expect(stripAddress('data:text/html;base64,AAAA')).toBe('data');
    expect(stripAddress('inline?secret')).toBe('inline');
    expect(stripAddress(undefined)).toBe('');
  });
});

test.describe('the public pages break no part of the policy', () => {
  // The control for the checks below: a clean page only means something if a violation would be seen.
  test('a script from an origin the policy does not name is reported by the browser', async ({ page }) => {
    const reports: string[] = [];
    await page.route('**/api/csp-report', async (route) => {
      reports.push(route.request().postData() ?? '');
      await route.fulfill({ status: 204 });
    });
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = 'https://not-allowed.example/x.js?secret=1';
      document.head.append(script);
    });
    await expect.poll(() => reports.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(reports.join('\n')).toContain('not-allowed.example');
    expect(reports.join('\n')).toContain('script-src');
  });

  for (const path of ['/', '/login', '/register', '/products', '/kitchens', '/terms']) {
    test(`${path} loads without a violation report`, async ({ page }) => {
      const reports: string[] = [];
      // The browser posts a report as soon as something breaks the policy; keep what it says.
      await page.route('**/api/csp-report', async (route) => {
        reports.push(route.request().postData() ?? '');
        await route.fulfill({ status: 204 });
      });
      await page.goto(path, { waitUntil: 'networkidle' });
      // Reports are sent a moment after the violation.
      await page.waitForTimeout(500);
      expect(reports, `violations on ${path}:\n${reports.join('\n')}`).toEqual([]);
    });
  }
});
