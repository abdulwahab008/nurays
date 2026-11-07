// The admin area is English-only (AdminShell renders it lang="en"), but the formatters in lib/utils follow the app
// language, which would drop Urdu dates into English sentences.
const LOCALE = 'en-PK';

function format(date: string | Date | undefined | null, options: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(LOCALE, options).format(d);
}

export function formatDate(date: string | Date | undefined | null): string {
  return format(date, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatDateTime(date: string | Date | undefined | null): string {
  return format(date, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
