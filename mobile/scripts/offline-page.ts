/**
 * The page shown when the website cannot be reached (www/offline.html) carries the site address in a line of its own:
 * on Android it is the only file the app serves from itself, so it can load nothing else. No side effects, so
 * `npm test` can import it.
 */

export function withAppUrl(html: string, url: string): string {
  const line = /const appUrl = ".*?";/;
  if (!line.test(html)) throw new Error('offline.html has no `const appUrl = "...";` line to write the address into.');
  return html.replace(line, () => `const appUrl = ${JSON.stringify(url)};`);
}

/** Where `cap copy` puts the page in each native project (both are gitignored, so the committed page is never changed). */
export const COPIED_OFFLINE_PAGE: Record<string, string> = {
  android: 'android/app/src/main/assets/public/offline.html',
  ios: 'ios/App/App/public/offline.html',
};
