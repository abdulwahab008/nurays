'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { mirroredTokenStore, nativePlugins, secureKV, syncTokens, appPathFromUrl, type NativeWindow } from '@/lib/native-shell';
import { setTokenStore, tokenStore } from '@/lib/token-store';

/**
 * Inside the Nuray store app (mobile/), connects the website to the phone; in a browser it does nothing.
 * - Sign-in tokens are also kept in the phone's secure storage, and come back from there if the page lost them.
 * - A link to the site or the app's scheme (an order, the payment return) opens its page in the app.
 * - Android's back button goes back, and closes the app on the first page.
 * - Dark status bar text on the light pages; the splash screen is hidden once the site has started.
 */
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    const plugins = nativePlugins(window as unknown as NativeWindow);
    if (!plugins) return;

    if (plugins.SecureStorage) {
      const secure = secureKV(plugins.SecureStorage);
      const base = tokenStore();
      setTokenStore(mirroredTokenStore(base, secure));
      void syncTokens(base, secure)
        .then((result) => {
          if (result === 'restored') window.location.reload();
        })
        .catch(() => undefined);
    }

    const listeners: Array<Promise<{ remove(): Promise<void> }>> = [];
    const App = plugins.App;
    if (App) {
      listeners.push(
        App.addListener('appUrlOpen', ({ url }) => {
          const path = appPathFromUrl(url, window.location.origin);
          if (path) router.push(path);
        })
      );
      listeners.push(
        App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) window.history.back();
          else void App.exitApp();
        })
      );
    }
    void plugins.StatusBar?.setStyle({ style: 'LIGHT' }).catch(() => undefined);
    void plugins.SplashScreen?.hide().catch(() => undefined);

    return () => {
      for (const handle of listeners) void handle.then((h) => h.remove()).catch(() => undefined);
    };
  }, [router]);

  return null;
}
