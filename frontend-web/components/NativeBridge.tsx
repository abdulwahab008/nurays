'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { forgetSavedTokens, nativePlugins, notificationPath, removeListener, secureKV, appPathFromUrl, type Listening, type NativeWindow } from '@/lib/native-shell';
import { apiClient, type ApiResponse } from '@/lib/api-client';
import { hasSession, useAuthStore, type User } from '@/lib/store/auth-store';
import { canGoBack, trackHistoryDepth } from '@/lib/native-back';

/**
 * Inside the Nuray store app (mobile/), connects the website to the phone; in a browser it does nothing.
 * - Sign-in tokens an earlier version kept in the phone's secure storage are removed (the refresh token is now a cookie).
 *   When the WebView lost its saved account but kept the cookie (iOS may clear storage under pressure), the account
 *   comes back from the cookie.
 * - A link to the site or the app's scheme (an order, the payment return) opens its page in the app.
 * - Android's back button goes back, and closes the app on the first page.
 * - A tapped notification opens the page it is about.
 * - Status bar text that suits the theme; the splash screen is hidden once the site has started.
 */
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    const plugins = nativePlugins(window as unknown as NativeWindow);
    if (!plugins) return;

    if (plugins.SecureStorage) void forgetSavedTokens(secureKV(plugins.SecureStorage)).catch(() => undefined);
    if (!hasSession()) {
      void apiClient
        .renewAccessToken()
        .then((token) => (token ? apiClient.get<ApiResponse<User>>('/auth/me') : null))
        .then((res) => {
          if (res?.data?.data) useAuthStore.getState().setUser(res.data.data);
        })
        .catch(() => undefined);
    }

    const listeners: Listening[] = [];
    const App = plugins.App;
    const untrackHistory = App ? trackHistoryDepth(window.history) : undefined;
    if (App) {
      listeners.push(
        App.addListener('appUrlOpen', ({ url }) => {
          const path = appPathFromUrl(url, window.location.origin);
          if (path) router.push(path);
        })
      );
      listeners.push(
        App.addListener('backButton', (event) => {
          if (canGoBack(event.canGoBack, window.history.state)) window.history.back();
          else void App.exitApp();
        })
      );
    }
    if (plugins.PushNotifications) {
      listeners.push(
        plugins.PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
          const path = notificationPath(notification?.data);
          if (path) router.push(path);
        })
      );
    }
    // Capacitor's DARK style is light text, for the dark theme (lib/hooks/use-theme.ts changes it when the theme does).
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    void plugins.StatusBar?.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => undefined);
    void plugins.SplashScreen?.hide().catch(() => undefined);

    return () => {
      listeners.forEach(removeListener);
      untrackHistory?.();
    };
  }, [router]);

  return null;
}
