import { NextRequest } from 'next/server';
import { sanitizeReports } from '@/lib/csp-report';

/**
 * Collector for Content-Security-Policy violation reports (the policy's `report-uri`). Browsers send
 * them without credentials and never show the answer, so this always says 204. Each violation becomes
 * one JSON line in the server log, with the page address reduced to origin and path (see lib/csp-report).
 *
 * Anyone can post here, so the body is capped and so is the number of reports logged per minute.
 */
const MAX_BODY_BYTES = 16 * 1024;
const MAX_REPORTS_PER_MINUTE = 120;

let windowStart = 0;
let logged = 0;

/** The request body as text, or null when it is larger than the cap (the rest is never read). */
async function readBounded(request: NextRequest): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function POST(request: NextRequest) {
  try {
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      logged = 0;
    }
    const text = logged < MAX_REPORTS_PER_MINUTE ? await readBounded(request) : null;
    if (text) {
      for (const violation of sanitizeReports(JSON.parse(text))) {
        if (logged++ >= MAX_REPORTS_PER_MINUTE) break;
        console.warn(JSON.stringify({ level: 'warn', type: 'csp-violation', ...violation }));
      }
    }
  } catch {
    // Not a report (or not JSON): there is nothing to log, and nothing to tell the sender.
  }
  return new Response(null, { status: 204 });
}
