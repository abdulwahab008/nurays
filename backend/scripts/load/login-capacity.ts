/**
 * Password sign-in capacity: a closed loop of POST /auth/login and nothing else, at rising concurrency, until the
 * admission limit starts shedding (503 SERVICE_BUSY). Each step reports successful sign-ins a second and their latency.
 *
 *   API_URLS=http://localhost:3201/api/v1 npx ts-node --transpile-only scripts/load/login-capacity.ts \
 *     --levels 2,4,8,16,32,64,128 --seconds 30 [--stop-503 1] [--json FILE]
 *
 * Accounts rotate through the seeded customers (fixture.json) and every request carries its own X-Forwarded-For, so
 * the per-address and per-account sign-in limiters stay out of the measurement. Use only against a *_load stack:
 * every successful sign-in starts a session (a refresh_tokens row).
 */
import fs from 'fs';
import { Fixture, FIXTURE_FILE, LOAD_PASSWORD, quantile, readJson } from './common';
import { numberOption, option, sleep } from './engine';

const API_URLS = (process.env.API_URLS ?? process.env.API_URL ?? 'http://localhost:3001/api/v1').split(',').map((u) => u.trim().replace(/\/+$/, ''));

interface Step {
  concurrency: number;
  seconds: number;
  requests: number;
  ok: number;
  okPerSec: number;
  shed503: number;
  throttled429: number;
  other: Record<string, number>;
  okP50: number;
  okP95: number;
  okP99: number;
  allP95: number;
  shedPct: number;
}

async function main() {
  const levels = (option('levels') ?? '2,4,8,16,32,64,128').split(',').map(Number);
  const seconds = numberOption('seconds', 30);
  const stopPct = numberOption('stop-503', 1);
  const emails = readJson<Fixture>(FIXTURE_FILE, 'The fixture').customers.map((c) => c.email);
  let nextAccount = 0;
  let nextRequest = 0;
  const steps: Step[] = [];

  for (const concurrency of levels) {
    const okMs: number[] = [];
    const allMs: number[] = [];
    const statuses: Record<string, number> = {};
    const stopAt = Date.now() + seconds * 1000;
    const started = Date.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (Date.now() < stopAt) {
          const n = nextRequest++;
          const email = emails[nextAccount++ % emails.length];
          const t0 = performance.now();
          let status = 0;
          try {
            const res = await fetch(`${API_URLS[n % API_URLS.length]}/auth/login`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` },
              body: JSON.stringify({ phoneOrEmail: email, otpCodeOrPassword: LOAD_PASSWORD, loginMethod: 'email' }),
              signal: AbortSignal.timeout(30_000),
            });
            await res.arrayBuffer();
            status = res.status;
          } catch {
            status = 0;
          }
          const ms = performance.now() - t0;
          allMs.push(ms);
          statuses[status] = (statuses[status] ?? 0) + 1;
          if (status === 200) okMs.push(ms);
          // A shed request is answered at once: a real client waits for Retry-After, a closed loop would just spin.
          else if (status === 503) await sleep(250);
        }
      })
    );
    const elapsed = (Date.now() - started) / 1000;
    okMs.sort((a, b) => a - b);
    allMs.sort((a, b) => a - b);
    const { 200: ok = 0, 503: shed = 0, 429: throttled = 0, ...other } = statuses;
    const step: Step = {
      concurrency,
      seconds: elapsed,
      requests: allMs.length,
      ok,
      okPerSec: ok / elapsed,
      shed503: shed,
      throttled429: throttled,
      other,
      okP50: quantile(okMs, 0.5),
      okP95: quantile(okMs, 0.95),
      okP99: quantile(okMs, 0.99),
      allP95: quantile(allMs, 0.95),
      shedPct: (100 * shed) / Math.max(1, allMs.length),
    };
    steps.push(step);
    console.log(
      `c=${concurrency}: ${step.requests} requests in ${elapsed.toFixed(1)} s; ${ok} ok = ${step.okPerSec.toFixed(1)}/s; ok p50 ${step.okP50.toFixed(0)} p95 ${step.okP95.toFixed(0)} p99 ${step.okP99.toFixed(0)} ms; 503 ${shed} (${step.shedPct.toFixed(1)} %); 429 ${throttled}; other ${JSON.stringify(other)}`
    );
    if (step.shedPct > stopPct) break;
    await sleep(5000);
  }

  const file = option('json');
  if (file) fs.writeFileSync(file, JSON.stringify({ targets: API_URLS, steps }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
