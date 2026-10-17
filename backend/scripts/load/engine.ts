/**
 * The measuring part of the load runner: one HTTP call that is timed and counted by endpoint name, virtual
 * users that loop for a while, an open-loop arrival rate, and the report with the launch targets.
 * Dependency-free on purpose (Node's fetch), so it runs anywhere the backend does.
 */
import fs from 'fs';
import path from 'path';
import { GENERATED_DIR, quantile } from './common';

export const API = (process.env.API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
export const ORIGIN = API.replace(/\/api\/v\d+$/, '');

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const think = (minMs = 300, maxMs = 1500) => sleep(minMs + Math.random() * (maxMs - minMs));
export const pickOne = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
export function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}
export function numberOption(name: string, fallback: number): number {
  const raw = option(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} needs a number, got "${raw}"`);
  return n;
}

// ---------------------------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------------------------

export interface EndpointStats {
  name: string;
  count: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  /** Mean response size in bytes. */
  avgBytes: number;
  ok: number;
  /** 429: the server protecting itself from this one address or account. */
  throttled: number;
  /** Other 4xx. */
  clientErrors: number;
  serverErrors: number;
  /** No answer at all: refused, reset or timed out. */
  networkErrors: number;
  /** Why answers of 400 and over were given, most common first: the status and the API's error code. */
  refusals: Refusal[];
}

export interface Refusal {
  status: number;
  code: string;
  count: number;
}

export class Recorder {
  private data = new Map<string, { ms: number[]; codes: Map<number, number>; bytes: number; reasons: Map<string, Refusal> }>();

  /** `status` 0 means no answer; `reason` is the API's error code for an answer of 400 and over. */
  record(name: string, ms: number, status: number, bytes = 0, reason?: string) {
    let entry = this.data.get(name);
    if (!entry) {
      entry = { ms: [], codes: new Map(), bytes: 0, reasons: new Map() };
      this.data.set(name, entry);
    }
    entry.ms.push(ms);
    entry.codes.set(status, (entry.codes.get(status) ?? 0) + 1);
    entry.bytes += bytes;
    if (status >= 400) {
      const code = reason ?? 'no error code';
      const key = `${status} ${code}`;
      const known = entry.reasons.get(key);
      if (known) known.count += 1;
      else entry.reasons.set(key, { status, code, count: 1 });
    }
  }

  stats(seconds: number): EndpointStats[] {
    const out: EndpointStats[] = [];
    for (const [name, entry] of this.data) {
      const sorted = [...entry.ms].sort((a, b) => a - b);
      let ok = 0;
      let throttled = 0;
      let clientErrors = 0;
      let serverErrors = 0;
      let networkErrors = 0;
      for (const [code, n] of entry.codes) {
        if (code === 0) networkErrors += n;
        else if (code === 429) throttled += n;
        else if (code >= 500) serverErrors += n;
        else if (code >= 400) clientErrors += n;
        else ok += n;
      }
      out.push({
        name,
        count: sorted.length,
        rps: seconds > 0 ? sorted.length / seconds : 0,
        p50: quantile(sorted, 0.5),
        p95: quantile(sorted, 0.95),
        p99: quantile(sorted, 0.99),
        max: sorted[sorted.length - 1] ?? 0,
        avgBytes: sorted.length ? entry.bytes / sorted.length : 0,
        ok,
        throttled,
        clientErrors,
        serverErrors,
        networkErrors,
        refusals: [...entry.reasons.values()].sort((a, b) => b.count - a.count || a.status - b.status || a.code.localeCompare(b.code)),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

export interface Call {
  /** What the call is counted as, e.g. "GET /products". */
  name: string;
  method: string;
  path: string;
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  /** Keep the parsed JSON answer (costs a little CPU on the generator). */
  parse?: boolean;
}

export interface Answer {
  status: number;
  body: any;
}

/** The `error.code` of an API error answer, when the body is one (a proxy's HTML page is not). */
function errorCodeOf(bytes: Uint8Array): string | undefined {
  try {
    const code = JSON.parse(Buffer.from(bytes).toString('utf8'))?.error?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

export async function http(rec: Recorder, call: Call): Promise<Answer> {
  const started = performance.now();
  try {
    const res = await fetch(API + call.path, {
      method: call.method,
      headers: {
        ...(call.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(call.token ? { authorization: `Bearer ${call.token}` } : {}),
        ...call.headers,
      },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    rec.record(call.name, performance.now() - started, res.status, bytes.byteLength, res.status >= 400 ? errorCodeOf(bytes) : undefined);
    let body: any = null;
    if (call.parse) {
      try {
        body = JSON.parse(Buffer.from(bytes).toString('utf8'));
      } catch {
        body = null;
      }
    }
    return { status: res.status, body };
  } catch {
    rec.record(call.name, performance.now() - started, 0);
    return { status: 0, body: null };
  }
}

// ---------------------------------------------------------------------------------------------
// Load shapes
// ---------------------------------------------------------------------------------------------

export interface Shape {
  seconds: number;
  /** Seconds over which the virtual users start, so the server is not hit by all of them at once. */
  ramp: number;
}

/** `count` virtual users, each repeating `iteration` until the time is up. */
export async function runVus(count: number, shape: Shape, iteration: (vu: number) => Promise<void>) {
  const stopAt = Date.now() + shape.seconds * 1000;
  await Promise.all(
    Array.from({ length: count }, async (_, vu) => {
      await sleep((shape.ramp * 1000 * vu) / Math.max(1, count));
      while (Date.now() < stopAt) {
        try {
          await iteration(vu);
        } catch {
          await sleep(250); // a failed iteration is already counted; do not spin
        }
      }
    })
  );
}

/** `perMinute` runs of `task` a minute for `seconds`, started on a fixed clock whether or not the last has finished (open loop). */
export async function runAtRate(perMinute: number, seconds: number, task: (n: number) => Promise<void>) {
  if (perMinute <= 0) return;
  const interval = 60_000 / perMinute;
  const stopAt = Date.now() + seconds * 1000;
  const running = new Set<Promise<void>>();
  let n = 0;
  let next = Date.now();
  while (next < stopAt) {
    const wait = next - Date.now();
    if (wait > 0) await sleep(wait);
    const run = task(n++).catch(() => undefined);
    running.add(run);
    void run.finally(() => running.delete(run));
    next += interval;
  }
  await Promise.all(running);
}

// ---------------------------------------------------------------------------------------------
// Targets and report
// ---------------------------------------------------------------------------------------------

/** The launch targets of the audit's load-test plan: reads under 300 ms and placing an order under 800 ms at the 95th percentile, no 5xx. */
export const TARGET_READ_MS = 300;
export const TARGET_WRITE_MS = 800;

export interface Target {
  /** p95 limit in ms for the endpoints whose name starts with this prefix. */
  prefix: string;
  p95Ms: number;
}

export function targetFor(name: string, overrides: Target[]): number {
  const hit = overrides.find((t) => name.startsWith(t.prefix));
  if (hit) return hit.p95Ms;
  return name.startsWith('GET ') ? TARGET_READ_MS : TARGET_WRITE_MS;
}

export interface Verdict {
  passed: boolean;
  failures: string[];
}

/**
 * `latency: false` is for a smoke run on a shared CI machine, where only errors mean something: a 5xx or a request
 * with no answer still fails, a slow answer does not.
 */
export function judge(stats: EndpointStats[], overrides: Target[] = [], minCount = 20, latency = true): Verdict {
  const failures: string[] = [];
  for (const s of stats) {
    if (s.serverErrors > 0) failures.push(`${s.name}: ${s.serverErrors} answers were 5xx`);
    if (s.networkErrors > 0) failures.push(`${s.name}: ${s.networkErrors} requests got no answer`);
    const limit = targetFor(s.name, overrides);
    if (latency && s.count >= minCount && s.p95 > limit) failures.push(`${s.name}: p95 ${s.p95.toFixed(0)} ms is over the ${limit} ms target`);
  }
  return { passed: failures.length === 0, failures };
}

const fmt = (n: number, digits = 0) => n.toFixed(digits);

export function printReport(title: string, seconds: number, stats: EndpointStats[], verdict: Verdict) {
  console.log(`\n${title} (${fmt(seconds)} s)\n`);
  const rows = stats.map((s) => [s.name, String(s.count), fmt(s.rps, 1), fmt(s.p50), fmt(s.p95), fmt(s.p99), fmt(s.max), String(s.ok), String(s.throttled), String(s.clientErrors), String(s.serverErrors), String(s.networkErrors), fmt(s.avgBytes / 1024, 1)]);
  const head = ['endpoint', 'count', 'rps', 'p50', 'p95', 'p99', 'max', '2xx', '429', '4xx', '5xx', 'none', 'KB'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  console.log(line(head));
  rows.forEach((r) => console.log(line(r)));
  const refused = stats.filter((s) => s.refusals.length > 0);
  if (refused.length > 0) {
    console.log('\nAnswers of 400 and over, by reason:');
    for (const s of refused) console.log(`  ${s.name}: ${s.refusals.slice(0, 5).map((r) => `${r.status} ${r.code} x${r.count}`).join(', ')}`);
  }
  console.log(verdict.passed ? '\nTargets met.' : `\nTargets missed:\n${verdict.failures.map((f) => `  - ${f}`).join('\n')}`);
}

export function saveResult(scenario: string, payload: unknown, explicit?: string): string {
  const file = explicit ?? path.join(GENERATED_DIR, 'results', `${scenario}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}
