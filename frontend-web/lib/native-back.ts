/**
 * Where the page is in its own history, for Android's back button. The app's WebView does not count the site's in-app
 * navigations (Next.js moves between pages with history.pushState), so its canGoBack stays false and Back would close
 * the app from any page. Each history entry is stamped with its position instead: one more than the entry it was
 * pushed from, the same when replaced. The stamp lives in history.state, so it is right again after Back, Forward or a
 * reload, and entries ahead of the current one (which history.length also counts) do not matter.
 */

const KEY = '__nurayDepth';

type HistoryLike = Pick<History, 'state' | 'pushState' | 'replaceState'>;

export function historyDepth(state: unknown): number {
  const depth = state && typeof state === 'object' ? (state as Record<string, unknown>)[KEY] : undefined;
  return typeof depth === 'number' && depth > 0 ? depth : 0;
}

function stamped(state: unknown, depth: number): unknown {
  if (state === null || state === undefined) return { [KEY]: depth };
  return typeof state === 'object' ? { ...state, [KEY]: depth } : state;
}

/** Stamps every entry the page adds or replaces from now on; returns a function that stops it where it can. */
export function trackHistoryDepth(history: HistoryLike): () => void {
  const push = history.pushState;
  const replace = history.replaceState;
  const trackedPush: History['pushState'] = (data, unused, url) =>
    push.call(history, stamped(data, historyDepth(history.state) + 1), unused, url);
  const trackedReplace: History['replaceState'] = (data, unused, url) =>
    replace.call(history, stamped(data, historyDepth(history.state)), unused, url);
  history.pushState = trackedPush;
  history.replaceState = trackedReplace;
  return () => {
    // Next.js may have wrapped these since; unwrapping then would drop its wrapper, and leaving ours is harmless.
    if (history.pushState === trackedPush) history.pushState = push;
    if (history.replaceState === trackedReplace) history.replaceState = replace;
  };
}

/** Back goes back while the page or the WebView has somewhere to go; on the first page it closes the app. */
export function canGoBack(nativeCanGoBack: boolean, state: unknown): boolean {
  return nativeCanGoBack || historyDepth(state) > 0;
}
