/** One spreadsheet cell: quoted when needed, and a text starting with = + - @ kept as text, not run as a formula. */
export const csvCell = (v: string | number) => {
  const text = String(v);
  const safe = /^[=+\-@]/.test(text) && typeof v === 'string' ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows: Array<Array<string | number>>): string => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
