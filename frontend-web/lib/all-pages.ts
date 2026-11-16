/** Every row of a paged listing, read one page after another until the server says there are no more pages. */
export async function readAllPages<T>(readPage: (page: number) => Promise<{ rows: T[]; totalPages: number }>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const { rows, totalPages } = await readPage(page);
    all.push(...rows);
    if (page >= totalPages || rows.length === 0) return all;
  }
}
