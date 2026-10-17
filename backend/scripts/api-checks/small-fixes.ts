/**
 * Small hardening fixes: kitchen search treats % and _ as plain characters and cuts a long term, a
 * malformed signed file link is a 400, a token only works for what it was issued for, logging out ends
 * the session, and the audit trail can be exported without a cell that a spreadsheet would run.
 */
import { API, call, login, makeKitchen, makeUser, ok, prisma, Reply, sleep, unique } from './lib';

/** A CSV text as rows of cells (every exported cell is quoted, a quote inside it is doubled). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell]);
  return rows;
}

/** Cells that start the way a spreadsheet takes for a formula. */
const formulaCells = (rows: string[][]) => rows.slice(1).flat().filter((cell) => /^[=+\-@\t\r]/.test(cell));

/** Only the super admin may export the audit trail, and a database has exactly one: use the one an earlier run or another suite made. */
async function superAdmin(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.user.findFirst({ where: { staffRole: 'super_admin' }, select: { email: true } });
    if (existing?.email) {
      try {
        return (await login(existing.email)).access;
      } catch (err) {
        throw new Error(`this database has a super admin that does not take the shared check password, so the audit export cannot be tried (${err instanceof Error ? err.message : err})`);
      }
    }
    try {
      return (await makeUser('admin', { staffRole: 'super_admin' })).access;
    } catch {
      await sleep(300); // another suite made it a moment ago
    }
  }
  throw new Error('there is no super admin to export the audit trail with');
}

export default async function smallFixes() {
  const u = unique();

  // 1. kitchen search: % and _ are plain characters, a long term is cut. The kitchens are told apart by a business
  // type of their own, so the lists hold only what was made here.
  const type = `chk-${u}`;
  const kitchen = async (businessName: string) => {
    const made = await makeKitchen();
    await prisma.seller.update({ where: { id: made.sellerId }, data: { businessName, businessType: type } });
    return made.sellerId;
  };
  const plain = await kitchen(`Plain Kitchen ${u}`);
  const percent = await kitchen(`Fifty% Kitchen ${u}`);
  const underscore = await kitchen(`Snake_case Kitchen ${u}`);
  const wordy = await kitchen(`${'Z'.repeat(100)}${u}`);
  const ids = (r: Reply): string[] => (r.body.data ?? []).map((s: any) => s.id);
  const search = (term = '') => call(null, 'GET', `/sellers?businessType=${type}&limit=50${term ? `&search=${encodeURIComponent(term)}` : ''}`);
  const everyone = await search();
  ok('the kitchens made here are listed', everyone.status === 200 && [plain, percent, underscore, wordy].every((id) => ids(everyone).includes(id)), ids(everyone).length);
  const pct = await search('%');
  ok('a lone % matches only the kitchen with a % in its name, not every kitchen', pct.status === 200 && ids(pct).length === 1 && ids(pct)[0] === percent, `${ids(pct).length} of ${ids(everyone).length}`);
  const under = await search('_');
  ok('a lone _ matches only the kitchen with an underscore in its name', under.status === 200 && ids(under).length === 1 && ids(under)[0] === underscore, `${ids(under).length} of ${ids(everyone).length}`);
  const longTerm = await search('Z'.repeat(100) + 'W'.repeat(4900));
  ok('a 5000-character search term is cut to its first 100 characters, not refused', longTerm.status === 200 && ids(longTerm).length === 1 && ids(longTerm)[0] === wordy, longTerm.code);

  // 2. a malformed signed file link is a client error (these links are served only by the local file store)
  const bad = await call(null, 'GET', '/files/x/%E0%A4%A?exp=1&sig=a', undefined, { origin: true });
  ok('a malformed signed file link answers 400, not 500', bad.status === 400 && ['FILE_LINK_INVALID', 'INVALID_PATH'].includes(String(bad.code)), bad.code);
  const forged = await call(null, 'GET', '/files/x/private/nothing.jpg?exp=1&sig=a', undefined, { origin: true });
  ok('a well-formed link with a bad signature is refused with 403', forged.status === 403 && forged.code === 'FILE_LINK_INVALID', forged.code);

  // 3. a token only works for what it was issued for
  const garbage = await call(null, 'POST', '/auth/refresh', { refreshToken: 'not.a.token' });
  ok('a garbage refresh token is refused (INVALID_REFRESH_TOKEN)', garbage.status === 401 && garbage.code === 'INVALID_REFRESH_TOKEN', garbage.code);
  const person = await makeUser('customer');
  ok('an access token opens the account', (await person.as('GET', '/auth/me')).status === 200);
  const asAccess = await call(person.refresh, 'GET', '/auth/me');
  ok('a refresh token cannot be used as an access token', asAccess.status === 401, asAccess.code);
  const minted = await call(null, 'POST', '/auth/refresh', { refreshToken: person.access });
  ok('an access token cannot mint new tokens', minted.status === 401, minted.code);
  const renewed = await call(null, 'POST', '/auth/refresh', { refreshToken: person.refresh });
  ok('while the refresh token itself does', renewed.status === 200 && !!renewed.body.data?.accessToken, renewed.code);
  await sleep(1100); // tokens are dated to the second; the logout must come after the sign-in
  await person.as('POST', '/auth/logout', {});
  const revoked = await call(null, 'POST', '/auth/refresh', { refreshToken: person.refresh });
  ok('after logout the refresh token says the session was revoked (SESSION_REVOKED)', revoked.status === 401 && revoked.code === 'SESSION_REVOKED', revoked.code);

  // 4. the audit export: only the super admin, and no cell a spreadsheet would run as a formula. A row with text that
  // starts like a formula in every exported text column (and an e-mail address that does) goes in first.
  const refused = await (await makeUser('admin')).as('GET', '/admin/audit-logs/export');
  ok('an ordinary admin cannot export the audit trail (INSUFFICIENT_STAFF_ROLE)', refused.status === 403 && refused.code === 'INSUFFICIENT_STAFF_ROLE', refused.code);
  const token = await superAdmin();
  const marker = `chk${u}`;
  const prober = await makeUser('customer');
  const email = `+${marker}@nuray.test`;
  await prisma.user.update({ where: { id: prober.id }, data: { email } });
  const action = `=HYPERLINK("http://evil.test/${marker}")`;
  await prisma.auditLog.create({ data: { userId: prober.id, action, entityType: '+cmd', entityId: '-2+3', ipAddress: '@SUM(1,1)', requestData: { note: '=1+1' }, responseStatus: 403 } });
  const exportCsv = (query = '') => fetch(`${API}/admin/audit-logs/export${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const all = await exportCsv();
  const allText = await all.text();
  ok('the audit export answers 200 as CSV and starts with its header', all.status === 200 && (all.headers.get('content-type') ?? '').startsWith('text/csv') && allText.startsWith('time,admin,action'), `${all.status} ${allText.slice(0, 20)}`);
  const risky = formulaCells(parseCsv(allText));
  ok('no exported cell starts like a spreadsheet formula', risky.length === 0, risky.slice(0, 3).join(' | '));
  ok('the formula check does notice a formula cell when there is one', formulaCells(parseCsv(`time,admin\n"t1","=1+1"\n"t2","'safe"\n`)).join('|') === '=1+1');
  const mine = await exportCsv(`?action=${encodeURIComponent(marker)}`);
  const rows = parseCsv(await mine.text());
  const row = rows[1] ?? [];
  ok('the row with formula-like text is in the export, each of those cells with a leading apostrophe', rows.length === 2 && JSON.stringify([row[1], row[2], row[3], row[4], row[6]]) === JSON.stringify([`'${email}`, `'${action}`, "'+cmd", "'-2+3", "'@SUM(1,1)"]), row);
}
