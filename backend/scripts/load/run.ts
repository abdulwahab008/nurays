/**
 * The launch load test (docs/LOAD_TESTING.md): one scenario against a running API, with the audit's targets
 * (reads under 300 ms and placing an order under 800 ms at the 95th percentile, no 5xx) as the verdict.
 *
 *   npm run load:run -- browse --vus 500 --duration 1200
 *   npm run load:run -- checkout --rate 50 --duration 1200
 *   npm run load:run -- rider-loop --vus 200 --duration 1200
 *   npm run load:run -- login-storm --rate 20 --duration 300
 *   npm run load:run -- sockets --sockets 2000 --duration 300 --jobs-per-minute 12
 *
 * Other options: --ramp S (start-up spread), --no-claim (riders only read), --anonymous (browse without
 * tokens), --json FILE, --smoke (fail on errors only, not on slow answers: for a short run on a shared machine).
 * Exit code 0 when the targets are met, 1 when not, 2 when the run could not start.
 */
import fs from 'fs';
import { Fixture, FIXTURE_FILE, readJson, TOKENS_FILE, TokenFile } from './common';
import { API, hasFlag, judge, numberOption, option, printReport, Recorder, saveResult, Target } from './engine';
import { browse, checkout, Context, Extra, loginStorm, riderLoop } from './scenarios';
import { sockets } from './sockets';

type Scenario = (ctx: Context) => Promise<Extra | void>;
interface Definition {
  run: Scenario;
  /** Defaults for a first, short run; the launch figures are in the guide. */
  defaults: { seconds: number; vus: number; perMinute: number; perSecond: number; sockets: number; ramp: number };
  needsTokens: boolean;
  targets: Target[];
}

const SCENARIOS: Record<string, Definition> = {
  browse: { run: browse, defaults: { seconds: 60, vus: 50, perMinute: 0, perSecond: 0, sockets: 0, ramp: 10 }, needsTokens: false, targets: [] },
  checkout: { run: checkout, defaults: { seconds: 120, vus: 0, perMinute: 30, perSecond: 0, sockets: 0, ramp: 0 }, needsTokens: true, targets: [] },
  'rider-loop': { run: riderLoop, defaults: { seconds: 120, vus: 100, perMinute: 0, perSecond: 0, sockets: 0, ramp: 10 }, needsTokens: true, targets: [] },
  'login-storm': { run: loginStorm, defaults: { seconds: 30, vus: 0, perMinute: 0, perSecond: 20, sockets: 0, ramp: 0 }, needsTokens: false, targets: [{ prefix: 'POST /auth/login', p95Ms: 1000 }] },
  sockets: { run: sockets, defaults: { seconds: 60, vus: 0, perMinute: 0, perSecond: 0, sockets: 500, ramp: 10 }, needsTokens: true, targets: [{ prefix: 'SOCKET connect', p95Ms: 2000 }, { prefix: 'EVENT delivery:new', p95Ms: 1000 }] },
};

async function main() {
  const name = process.argv[2];
  const scenario = name ? SCENARIOS[name] : undefined;
  if (!scenario) {
    console.error(`Usage: npm run load:run -- <${Object.keys(SCENARIOS).join('|')}> [options]  (see the top of scripts/load/run.ts)`);
    process.exit(2);
  }

  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health || health.status !== 200) {
    console.error(`The API at ${API} does not answer. Set API_URL.`);
    process.exit(2);
  }

  const fixture = readJson<Fixture>(FIXTURE_FILE, 'The fixture');
  let tokens: TokenFile | null = fs.existsSync(TOKENS_FILE) ? readJson<TokenFile>(TOKENS_FILE, 'The tokens') : null;
  if (hasFlag('anonymous')) tokens = null;
  if (scenario.needsTokens && !tokens) {
    console.error('This scenario needs tokens. Run `npm run load:tokens` first.');
    process.exit(2);
  }

  const seconds = numberOption('duration', scenario.defaults.seconds);
  if (tokens && new Date(tokens.expiresAt).getTime() < Date.now() + seconds * 1000) {
    console.warn(`Warning: the tokens expire at ${tokens.expiresAt}, before this run ends. Mint new ones (\`npm run load:tokens\`) or shorten the run.`);
  }
  const ctx: Context = {
    rec: new Recorder(),
    fixture,
    tokens,
    shape: { seconds, ramp: numberOption('ramp', scenario.defaults.ramp) },
    vus: numberOption('vus', scenario.defaults.vus),
    perMinute: numberOption('rate', scenario.defaults.perMinute),
    perSecond: numberOption('rate', scenario.defaults.perSecond),
    claim: !hasFlag('no-claim'),
    sockets: numberOption('sockets', scenario.defaults.sockets),
    jobsPerMinute: numberOption('jobs-per-minute', 12),
  };

  console.log(`Running "${name}" against ${API} for ${seconds} s...`);
  const started = Date.now();
  const extra = (await scenario.run(ctx)) ?? { notes: [], failures: [] };
  const elapsed = (Date.now() - started) / 1000;

  const stats = ctx.rec.stats(elapsed);
  const verdict = judge(stats, scenario.targets, 20, !hasFlag('smoke'));
  verdict.failures.push(...extra.failures);
  verdict.passed = verdict.failures.length === 0;
  printReport(`Scenario ${name}`, elapsed, stats, verdict);
  extra.notes.forEach((note) => console.log(`  ${note}`));
  const file = saveResult(name, { scenario: name, api: API, seconds: elapsed, options: { vus: ctx.vus, perMinute: ctx.perMinute, perSecond: ctx.perSecond, sockets: ctx.sockets }, stats, notes: extra.notes, failures: verdict.failures }, option('json'));
  console.log(`\nResult saved to ${file}`);
  process.exit(verdict.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
