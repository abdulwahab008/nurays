/**
 * Runs the API checks against a running API and its database (see lib.ts), and exits 1 when one fails.
 *
 *   API_URL=http://localhost:3001/api/v1 DATABASE_URL=postgresql://... npm run api-checks
 *   npm run api-checks -- security delivery     only the suites whose name contains one of these words
 *
 * Start the API with AUTO_ASSIGN_ENABLED=false (the checks claim delivery jobs by hand) and use a
 * throwaway database: the checks leave their users, kitchens and orders behind (the next run only
 * closes the delivery jobs they left waiting).
 */
import { API, call, ok, prisma, totals } from './lib';

const SUITES: Array<[name: string, load: () => Promise<{ default: () => Promise<void> }>]> = [
  ['account-closure', () => import('./account-closure')],
  ['snapshot', () => import('./snapshot')],
  ['security', () => import('./security')],
  ['validation', () => import('./validation')],
  ['delivery', () => import('./delivery')],
  ['pool', () => import('./pool')],
  ['views', () => import('./views')],
  ['small-fixes', () => import('./small-fixes')],
  ['privacy', () => import('./privacy')],
  ['kitchen-view', () => import('./kitchen-view')],
  ['sign-in', () => import('./sign-in')],
  ['moderation', () => import('./moderation')],
];

/** The hosts that count as this machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** The host of a URL, or null when there is none to judge (no URL, not a URL, or a database reached through a local socket). */
function hostOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname || null : null;
  } catch {
    return null;
  }
}

/**
 * Every account these checks create has the same known password, and they write kitchens, riders and
 * orders: they must never run against a shared or live environment by accident.
 */
function refuseUnlessLocal(): void {
  if (process.env.API_CHECKS_ALLOW_REMOTE === 'true') return;
  const remote = [
    ['the API', hostOf(API)],
    ['the database', hostOf(process.env.DATABASE_URL)],
  ].filter(([, host]) => host !== null && !LOCAL_HOSTS.has(host as string));
  if (remote.length === 0) return;
  console.error(
    `Refusing to run: ${remote.map(([what, host]) => `${what} is at ${host}`).join(' and ')}. The checks create accounts with a known password. ` +
      'Point them at a local API and a throwaway database; API_CHECKS_ALLOW_REMOTE=true overrides this for a private test environment.'
  );
  process.exit(2);
}

async function main() {
  refuseUnlessLocal();
  const wanted = process.argv.slice(2).map((w) => w.toLowerCase());
  const chosen = SUITES.filter(([name]) => wanted.length === 0 || wanted.some((w) => name.includes(w)));
  if (chosen.length === 0) {
    console.error(`No suite matches ${wanted.join(', ')}. Suites: ${SUITES.map(([name]) => name).join(', ')}`);
    process.exit(2);
  }

  const health = await call(null, 'GET', '/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.error(`The API at ${API} does not answer. Start it first (see the top of scripts/api-checks/run-all.ts).`);
    process.exit(2);
  }

  // The open-pool list shows the oldest hundred waiting jobs, so jobs an earlier run left waiting would
  // push this run's out of it. Close only the ones that belong to the check accounts.
  const stale = await prisma.delivery.updateMany({
    where: { riderId: null, status: 'pending', order: { customer: { email: { startsWith: 'chk.', endsWith: '@nuray.test' } } } },
    data: { status: 'cancelled' },
  });
  if (stale.count > 0) console.log(`(closed ${stale.count} delivery jobs left waiting by earlier runs)`);

  for (const [name, load] of chosen) {
    console.log(`\n== ${name} ==`);
    const before = totals();
    try {
      await (await load()).default();
    } catch (err) {
      // A suite that cannot even set itself up is a failure, not a pass by silence.
      ok(`${name}: the suite ran to the end`, false, err instanceof Error ? err.message : String(err));
    }
    const after = totals();
    if (after.passed + after.failed === before.passed + before.failed) ok(`${name}: the suite made at least one check`, false);
  }

  const { passed, failed } = totals();
  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(2);
});
