import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllPages } from '../../lib/all-pages.ts';

// A kitchen's dishes page read only the server's first page (20 dishes), so a kitchen with more could not manage the rest.
test('every page is read, in order, until the last one', async () => {
  const dishes = Array.from({ length: 205 }, (_, i) => `dish-${i}`);
  const asked: number[] = [];
  const all = await readAllPages(async (page) => {
    asked.push(page);
    return { rows: dishes.slice((page - 1) * 100, page * 100), totalPages: 3 };
  });
  assert.deepEqual(asked, [1, 2, 3]);
  assert.deepEqual(all, dishes);
});

test('a single page is read once', async () => {
  let calls = 0;
  const all = await readAllPages(async () => {
    calls += 1;
    return { rows: ['a', 'b'], totalPages: 1 };
  });
  assert.equal(calls, 1);
  assert.deepEqual(all, ['a', 'b']);
});

test('an empty listing, or a page count that outlives the rows, does not loop', async () => {
  assert.deepEqual(await readAllPages(async () => ({ rows: [], totalPages: 0 })), []);
  let calls = 0;
  const all = await readAllPages(async (page) => {
    calls += 1;
    return { rows: page === 1 ? ['a'] : [], totalPages: 50 };
  });
  assert.deepEqual(all, ['a']);
  assert.equal(calls, 2);
});
