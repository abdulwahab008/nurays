import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiClient } from '../api-client';

export interface User {
  id: string;
  phone: string;
  email?: string;
  user_type?: string;
  userType?: string;
  emailVerified?: boolean;
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
        const hasToken = typeof window !== 'undefined' && !!(sessionStorage.getItem('access_token') || localStorage.getItem('access_token'));
        set({ user: normalizedUser, isAuthenticated: hasToken });
      },
      logout: () => {
        // Fire-and-forget — we don't block UI on the server response, but we
        // do tell the backend so it can blacklist the token if it implements
        // server-side session revocation.
        apiClient.post('/auth/logout').catch(() => {
          // Ignore — logout is best-effort.
        });
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
          const hasToken = !!(sessionStorage.getItem('access_token') || localStorage.getItem('access_token'));
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

