/**
 * Content-Security-Policy violation reports, cut down for the log.
 *
 * Browsers send them in two shapes: the original `report-uri` body (`{ "csp-report": { ... } }`, content
 * type `application/csp-report`) and the Reporting API's (`[{ "type": "csp-violation", "body": { ... } }]`,
 * `application/reports+json`). The address of the page can carry a secret (a password-reset link has
 * its token in the query string), so every address is reduced to its origin and path, and every field is
 * capped. The script sample is never kept.
 */

export interface CspViolation {
  /** The directive that was violated, e.g. `script-src-elem`. */
  directive: string;
  /** What was blocked: an address (origin and path only) or a keyword such as `inline`, `eval`, `data`. */
  blocked: string;
  /** The page that broke the policy (origin and path only). */
  page: string;
  /** The script or stylesheet the violation came from (origin and path only), if the browser says. */
  source: string;
  line: number | null;
  /** `report` for a report-only policy, `enforce` for an enforced one. */
  disposition: string;
}

const MAX_FIELD = 200;
const MAX_REPORTS_PER_REQUEST = 10;

const cap = (value: unknown): string => (typeof value === 'string' ? value.slice(0, MAX_FIELD) : '');

/** An address without its query and fragment; anything that is not an http(s) address (`inline`, `eval`, `data`...) as it is. */
export function stripAddress(value: unknown): string {
  const text = cap(value).trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') return url.origin + url.pathname;
    return url.protocol.replace(/:$/, '');
  } catch {
    // Not an address (a keyword, or a truncated value): keep it only if it cannot hold a query string.
    return /[?#]/.test(text) ? text.split(/[?#]/)[0] : text;
  }
}

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

function fromBody(body: Record<string, unknown>): CspViolation {
  // The legacy body uses dashed names, the Reporting API camel case.
  const pick = (dashed: string, camel: string) => body[dashed] ?? body[camel];
  const line = Number(pick('line-number', 'lineNumber'));
  return {
    directive: cap(pick('effective-directive', 'effectiveDirective') ?? pick('violated-directive', 'violatedDirective')),
    blocked: stripAddress(pick('blocked-uri', 'blockedURL') ?? pick('blocked-uri', 'blockedURI')),
    page: stripAddress(pick('document-uri', 'documentURL') ?? pick('document-uri', 'documentURI')),
    source: stripAddress(pick('source-file', 'sourceFile')),
    line: Number.isFinite(line) && line > 0 ? Math.floor(line) : null,
    disposition: cap(body.disposition) === 'enforce' ? 'enforce' : 'report',
  };
}

/** The violations in a parsed report body, whichever format it came in; anything else yields none. */
export function sanitizeReports(parsed: unknown): CspViolation[] {
  if (Array.isArray(parsed)) {
    return parsed
      .slice(0, MAX_REPORTS_PER_REQUEST)
      .map((entry) => record(entry))
      .filter((entry): entry is Record<string, unknown> => !!entry && entry.type === 'csp-violation' && !!record(entry.body))
      .map((entry) => fromBody(record(entry.body)!));
  }
  const legacy = record(record(parsed)?.['csp-report']);
  return legacy ? [fromBody(legacy)] : [];
}
