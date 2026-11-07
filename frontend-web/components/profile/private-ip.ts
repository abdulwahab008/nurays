// No imports, so `npm test` covers it (tests/unit/private-ip.test.ts).

/** A loopback or private-network address says nothing to the person reading it, so it is not shown. */
export function isPrivateIp(ip: string | null | undefined): boolean {
  const v = (ip ?? '').trim().replace(/^::ffff:/, '');
  if (!v) return true;
  return (
    v === '::1' ||
    /^127\./.test(v) ||
    /^10\./.test(v) ||
    /^192\.168\./.test(v) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v) ||
    /^169\.254\./.test(v) ||
    /^f[cd][0-9a-f]{2}:/i.test(v) ||
    /^fe80:/i.test(v)
  );
}
