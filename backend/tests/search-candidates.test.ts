/**
 * Dish search ORed every column and the kitchen's name across a join with the search terms, so
 * PostgreSQL scanned every dish and the trigram indexes went unused. The query now narrows the
 * dishes first with one plain predicate per indexed column and term, which the trigram indexes
 * answer with a bitmap scan each. The database is a double that records the SQL.
 */
import { Prisma } from '@prisma/client';

const queryRaw = jest.fn(async () => []);
const tx = { $executeRaw: jest.fn(), $queryRaw: queryRaw };
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) },
}));

import { searchRankedProductIds } from '../src/services/ranking.service';

async function searchSql(terms: string[]) {
  await searchRankedProductIds(terms);
  const [strings, ...values] = queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
  return Prisma.sql(strings, ...values);
}

describe('dish search', () => {
  it('narrows dishes with per-column, per-term predicates the trigram indexes can serve', async () => {
    const sql = await searchSql(['Biryani', 'briyani']);
    const where = sql.sql.slice(sql.sql.indexOf('WHERE ('));

    for (const column of ['p.name ILIKE ?', 'p.name_urdu ILIKE ?', 'p.description ILIKE ?', '?::text <% p.name']) {
      expect(where.split(column).length - 1).toBe(2);
    }
    expect(where).toMatch(/p\.seller_id = ANY\(ARRAY\(SELECT id FROM sellers WHERE business_name ILIKE ANY/);
    expect(sql.values).toEqual(expect.arrayContaining(['biryani', '%biryani%', 'briyani', '%briyani%']));
  });

  it('escapes LIKE wildcards in the predicates too', async () => {
    const sql = await searchSql(['50%_off']);
    expect(sql.values).toContain('%50\\%\\_off%');
  });
});
