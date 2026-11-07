import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useCartStore } from './cart-store';
import { apiClient } from '../api-client';
import { dropPushSubscription, pushEndpointHere } from '../push';
import { tokenStore } from '../token-store';
import { clearSignOut, noteSignOut } from '../auth-redirect';

export interface User {
  id: string;
  phone: string;
  email?: string;
  user_type?: string;
  userType?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  status?: string;
  /** Staff accounts only: super_admin, admin or support, and what that role may do. */
  staffRole?: 'super_admin' | 'admin' | 'support' | null;
  permissions?: string[];
  profile?: {
    fullName?: string;
    full_name?: string;
    avatarUrl?: string;
    avatar_url?: string;
    city?: string;
    area?: string;
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => {
        if (!user) {
          set({ user: null, isAuthenticated: false });
          return;
        }
        // Normalize user data
        const normalizedUser: User = {
          ...user,
          userType: user.userType || user.user_type,
          profile: user.profile
            ? {
                fullName: user.profile.fullName || user.profile.full_name,
                avatarUrl: user.profile.avatarUrl || user.profile.avatar_url,
                city: user.profile.city,
                area: user.profile.area,
              }
            : undefined,
        };
        clearSignOut();
        set({ user: normalizedUser, isAuthenticated: true });
      },
      logout: () => {
        // Fire-and-forget: the UI does not wait for the server. It ends this device's session (its tokens stop working
        // at once; the account's other devices stay signed in) and forgets this browser's push subscription.
        // The token is read now, before it is cleared below: the request's auth
        // header is attached asynchronously, so it would otherwise go out empty.
        const token = apiClient.getAccessToken();
        void (async () => {
          const pushEndpoint = await pushEndpointHere();
          await apiClient
            .post('/auth/logout', pushEndpoint ? { pushEndpoint } : {}, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
            .catch(() => {
              // Ignore — logout is best-effort.
            });
          // Nor should the next person on this browser inherit the previous account's push notifications.
          await dropPushSubscription();
        })();
        // The cart is persisted per browser, not per account: leaving it behind
        // let the next person to sign in on this device inherit (and sync into
        // their own server cart) the previous user's items.
        useCartStore.getState().clearCart();
        useCartStore.getState().setAppliedPromoCode(null);
        noteSignOut();
        // Before the tokens go: a tab kept apart writes the signed-out account to its own storage, not every tab's.
        set({ user: null, isAuthenticated: false });
        tokenStore().clear();
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          if (typeof window === 'undefined') return null;
          const sessionVal = sessionStorage.getItem(name);
          if (sessionVal) return sessionVal;
          return localStorage.getItem(name);
        },
        setItem: (name: string, value: string) => {
          if (typeof window === 'undefined') return;
          if (tokenStore().tabIsolated()) {
            sessionStorage.setItem(name, value);
          } else {
            localStorage.setItem(name, value);
          }
        },
        removeItem: (name: string) => {
          if (typeof window === 'undefined') return;
          sessionStorage.removeItem(name);
          localStorage.removeItem(name);
        },
      })),
      // The saved account says who is signed in; the access token comes back through the refresh cookie on the first
      // request, and a session that has ended clears the account then (auth:session-ended below).
      onRehydrateStorage: () => (state) => {
        if (state) state.isAuthenticated = !!state.user;
      },
    }
  )
);

/**
 * Is someone signed in on this browser? Read from the store itself, not a hook: on a page's first render after a load the
 * hook still gives the server's signed-out snapshot, and an effect acting on that would send a signed-in person to the
 * sign-in page. (The access token is no help there: it is not back from the refresh cookie yet.)
 */
export const hasSession = (): boolean => useAuthStore.getState().isAuthenticated;
apiClient.setSessionHint(hasSession);

if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-ended', () => useAuthStore.setState({ user: null, isAuthenticated: false }));
  // Another tab signed in or out: the shared cookie changed with it, so this tab follows.
  window.addEventListener('storage', (event) => {
    if (event.key !== 'auth-storage' || tokenStore().tabIsolated()) return;
    void Promise.resolve(useAuthStore.persist.rehydrate()).then(() => {
      if (!useAuthStore.getState().user) apiClient.clearTokens();
    });
  });
}

