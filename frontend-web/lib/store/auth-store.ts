import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useCartStore } from './cart-store';
import { apiClient } from '../api-client';

export interface User {
  id: string;
  phone: string;
  email?: string;
  user_type?: string;
  userType?: string;
  emailVerified?: boolean;
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
        const hasToken = !!apiClient.getAccessToken();
        set({ user: normalizedUser, isAuthenticated: hasToken });
      },
      logout: () => {
        // Fire-and-forget — we don't block UI on the server response, but we
        // do tell the backend so it can blacklist the token if it implements
        // server-side session revocation.
        // The token is read now, before it is cleared below: the request's auth
        // header is attached asynchronously, so it would otherwise go out empty.
        const token = apiClient.getAccessToken();
        apiClient
          .post('/auth/logout', {}, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
          .catch(() => {
            // Ignore — logout is best-effort.
          });
        // The cart is persisted per browser, not per account: leaving it behind
        // let the next person to sign in on this device inherit (and sync into
        // their own server cart) the previous user's items.
        useCartStore.getState().clearCart();
        useCartStore.getState().setAppliedPromoCode(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('access_token');
          sessionStorage.removeItem('refresh_token');
          sessionStorage.removeItem('tab_isolated');
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        set({ user: null, isAuthenticated: false });
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
          if (sessionStorage.getItem('tab_isolated') === 'true') {
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
      // On rehydrate, ensure tokens are valid and set isAuthenticated
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== 'undefined') {
          const hasToken = !!apiClient.getAccessToken();
          // If we have a token but no user, clear the token (invalid state)
          if (hasToken && !state.user) {
            sessionStorage.removeItem('access_token');
            sessionStorage.removeItem('refresh_token');
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            state.isAuthenticated = false;
          } else {
            // Update isAuthenticated based on user and token
            state.isAuthenticated = !!state.user && hasToken;
          }
        }
      },
    }
  )
);

