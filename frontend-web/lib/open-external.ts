/**
 * Opening something outside the app: a maps app, a document, a legal page. On the web that is a new tab; inside a
 * native shell (Capacitor) a new tab does not exist, so the shell's browser or app launcher is used. Everything that
 * leaves the app goes through here, so the native shell has one place to change and the web behaves as before.
 */

/** The part of the window these helpers use, so they can be run against a stand-in in tests. */
export interface ExternalWindow {
  open(url?: string, target?: string, features?: string): { closed?: boolean; opener?: unknown; location: { href: string }; close(): void } | null;
  location: { assign(url: string): void; origin?: string };
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      /** An in-app browser for http(s) pages. */
      Browser?: { open(options: { url: string }): Promise<unknown> };
      /** The operating system's launcher for everything else (geo:, maps:, tel:). */
      AppLauncher?: { openUrl(options: { url: string }): Promise<unknown> };
    };
  };
}

const defaultWindow = (): ExternalWindow | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as ExternalWindow));

/** Whether the page runs inside the native shell of the store app (always false in a browser). */
export function isNativeShell(win: ExternalWindow | undefined = defaultWindow()): boolean {
  return Boolean(win?.Capacitor?.isNativePlatform?.());
}

/** Open a link outside the app (new tab on the web, the shell's browser or launcher on a phone app). Call it from a tap. */
export function openExternal(url: string, win: ExternalWindow | undefined = defaultWindow()): void {
  if (!win) return;
  if (isNativeShell(win)) {
    // The shell wants a full address, and picks the in-app browser for web pages and the launcher for the rest.
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : new URL(url, win.location.origin ?? 'http://localhost').toString();
    const plugins = win.Capacitor?.Plugins;
    const plugin = /^https?:/i.test(absolute) ? plugins?.Browser : plugins?.AppLauncher;
    if (plugin) {
      void ('open' in plugin ? plugin.open({ url: absolute }) : plugin.openUrl({ url: absolute }));
      return;
    }
  }
  win.open(url, '_blank', 'noopener,noreferrer');
}

export interface ReservedExternal {
  /** Go to the link now that it is known. */
  open(url: string): void;
  /** The link will not be needed after all: close what was reserved. */
  cancel(): void;
}

/**
 * For a link that is only known after something is awaited (a job claimed, a status saved). Browsers block a tab
 * opened after a network call, so the tab is opened now, inside the tap, and sent to the link later. Without a tab
 * (a blocked pop-up) the app itself leaves for the link, and the person comes back with the back button.
 */
export function reserveExternal(win: ExternalWindow | undefined = defaultWindow()): ReservedExternal {
  if (!win) return { open: () => undefined, cancel: () => undefined };
  if (isNativeShell(win)) return { open: (url) => openExternal(url, win), cancel: () => undefined };
  const tab = win.open('', '_blank');
  // The tab is ours to steer, but the page it ends up on is not: it gets no handle back to this one.
  if (tab) tab.opener = null;
  return {
    open(url) {
      if (tab && !tab.closed) tab.location.href = url;
      else win.location.assign(url);
    },
    cancel() {
      tab?.close();
    },
  };
}
