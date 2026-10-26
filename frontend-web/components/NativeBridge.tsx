'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { mirroredTokenStore, nativePlugins, secureKV, syncTokens, appPathFromUrl, type NativeWindow } from '@/lib/native-shell';
import { setTokenStore, tokenStore } from '@/lib/token-store';
import { apiClient, type ApiResponse } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/store/auth-store';

/**
 * Inside the Nuray store app (mobile/), connects the website to the phone; in a browser it does nothing.
 * - Sign-in tokens are also kept in the phone's secure storage; if the page lost them they come back from there and the
 *   account is loaded again.
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
        .then(async (result) => {
          if (result !== 'restored') return;
          // The page lost its storage, its saved account with it, so the account is read again with the restored
          // tokens. (Not a reload: the auth store drops tokens it finds without an account, which would loop.) A sign-in
          // that no longer works ends the usual way, clearing secure storage too.
          const res = await apiClient.get<ApiResponse<User>>('/auth/me');
          if (res.data?.data) useAuthStore.getState().setUser(res.data.data);
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
